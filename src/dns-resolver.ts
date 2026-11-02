import dns from "node:dns";

// Ensure reliable DNS resolution for Neon cloud endpoints across local networks and ISPs
const origLookup = dns.lookup;

try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {
  // Fallback to default if setServers is not supported in environment
}

(dns as any).lookup = (hostname: string, options: any, callback: any) => {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  if (hostname && hostname.includes("neon.tech")) {
    dns.resolve4(hostname, (err, addrs) => {
      if (!err && addrs && addrs.length > 0) {
        if (options && options.all) {
          return callback(
            null,
            addrs.map((a) => ({ address: a, family: 4 }))
          );
        }
        return callback(null, addrs[0], 4);
      }
      return origLookup(hostname, options, callback);
    });
  } else {
    return origLookup(hostname, options, callback);
  }
};
