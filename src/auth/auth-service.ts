import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { appPool, adminPool } from "../db/tenant-context.js";
import { config } from "../config.js";

export interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  is_platform_admin: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  organizationId?: string;
  role?: string;
}

export class AuthService {
  private saltRounds = 10;

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  signAccessToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpiresIn as any,
    });
  }

  signRefreshToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.refreshExpiresIn as any,
    });
  }

  verifyToken(token: string): AuthTokenPayload {
    try {
      return jwt.verify(token, config.jwt.secret) as AuthTokenPayload;
    } catch (err: any) {
      throw new Error(`Invalid or expired token: ${err.message}`);
    }
  }

  async registerUser(input: {
    email: string;
    password: string;
    fullName: string;
    isPlatformAdmin?: boolean;
  }): Promise<UserRecord> {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("Invalid email address format");
    }

    if (!input.password || input.password.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }

    const client = await adminPool.connect();
    try {
      const existing = await client.query(
        "SELECT id FROM users WHERE email = $1;",
        [normalizedEmail]
      );
      if (existing.rows.length > 0) {
        throw new Error("A user with this email address already exists");
      }

      const passwordHash = await this.hashPassword(input.password);
      const isPlatformAdmin = Boolean(input.isPlatformAdmin);

      const result = await client.query(
        `INSERT INTO users (email, password_hash, full_name, is_platform_admin)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, full_name, is_platform_admin, is_active, created_at, updated_at;`,
        [normalizedEmail, passwordHash, input.fullName.trim(), isPlatformAdmin]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async loginUser(input: {
    email: string;
    password: string;
  }): Promise<{
    user: UserRecord;
    accessToken: string;
    refreshToken: string;
    memberships: Array<{
      organizationId: string;
      organizationName: string;
      organizationSlug: string;
      role: string;
    }>;
  }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const client = await adminPool.connect();
    try {
      const userRes = await client.query(
        `SELECT id, email, password_hash, full_name, is_platform_admin, is_active, created_at, updated_at
         FROM users
         WHERE email = $1;`,
        [normalizedEmail]
      );

      if (userRes.rows.length === 0) {
        throw new Error("Invalid email or password");
      }

      const userRow = userRes.rows[0];
      if (!userRow.is_active) {
        throw new Error("User account is inactive");
      }

      const isMatch = await this.verifyPassword(input.password, userRow.password_hash);
      if (!isMatch) {
        throw new Error("Invalid email or password");
      }

      // Fetch user's organizations
      const memberRes = await client.query(
        `SELECT om.organization_id, o.name AS organization_name, o.slug AS organization_slug, om.role
         FROM organization_memberships om
         JOIN organizations o ON om.organization_id = o.id
         WHERE om.user_id = $1 AND om.is_active = true AND o.is_active = true;`,
        [userRow.id]
      );

      const memberships = memberRes.rows.map((row) => ({
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        organizationSlug: row.organization_slug,
        role: row.role,
      }));

      const primaryOrg = memberships[0];
      const payload: AuthTokenPayload = {
        userId: userRow.id,
        email: userRow.email,
        isPlatformAdmin: userRow.is_platform_admin,
        organizationId: primaryOrg?.organizationId,
        role: primaryOrg?.role,
      };

      const accessToken = this.signAccessToken(payload);
      const refreshToken = this.signRefreshToken(payload);

      const sanitizedUser: UserRecord = {
        id: userRow.id,
        email: userRow.email,
        full_name: userRow.full_name,
        is_platform_admin: userRow.is_platform_admin,
        is_active: userRow.is_active,
        created_at: userRow.created_at,
        updated_at: userRow.updated_at,
      };

      return {
        user: sanitizedUser,
        accessToken,
        refreshToken,
        memberships,
      };
    } finally {
      client.release();
    }
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    const client = await adminPool.connect();
    try {
      const result = await client.query(
        `SELECT id, email, full_name, is_platform_admin, is_active, created_at, updated_at
         FROM users
         WHERE id = $1;`,
        [userId]
      );
      if (result.rows.length === 0) return null;
      return result.rows[0];
    } finally {
      client.release();
    }
  }
}
