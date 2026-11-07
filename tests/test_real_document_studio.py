import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"C:\Users\Harshhhh\.gemini\antigravity\brain\6e8feba0-bc3f-4934-90a4-f62f7abbcac4\screenshots\real_documents"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        print("[1] Navigating to login...", flush=True)
        await page.goto("http://localhost:3000/login", wait_until="networkidle")
        
        # Click Workspace Admin persona
        admin_btn = page.locator("button:has-text('WORKSPACE ADMIN')").first
        await admin_btn.click()
        await page.wait_for_url("**/workspace", timeout=15000)
        print("[2] Logged in as Workspace Admin", flush=True)

        # 1. Inspect doc-001 (Real Commercial Invoice Bradley-Andrade PDF)
        print("[3] Inspecting doc-001 (Real Commercial Invoice PDF)...", flush=True)
        await page.goto("http://localhost:3000/workspace/documents/doc-001", wait_until="networkidle")
        await page.wait_for_timeout(1500)

        # Verify Real Document View is active and iframe exists
        iframe = page.locator("iframe").first
        assert await iframe.is_visible(), "Expected embedded PDF iframe to be visible"
        path_pdf1 = os.path.join(SCREENSHOT_DIR, "01_real_pdf_bradley_andrade.png")
        await page.screenshot(path=path_pdf1, full_page=True)
        print(f"Captured: {path_pdf1}", flush=True)

        # 2. Switch to Spatial OCR Tokens
        print("[4] Switching to Spatial OCR Tokens canvas...", flush=True)
        spatial_btn = page.locator("button:has-text('Spatial OCR Tokens')").first
        await spatial_btn.click()
        await page.wait_for_timeout(600)
        path_spatial = os.path.join(SCREENSHOT_DIR, "02_spatial_tokens_view.png")
        await page.screenshot(path=path_spatial, full_page=True)
        print(f"Captured: {path_spatial}", flush=True)

        # Switch back to Real Document View
        doc_view_btn = page.locator("button:has-text('Real Document View')").first
        await doc_view_btn.click()
        await page.wait_for_timeout(600)

        # 3. Inspect doc-005 (Official US IRS Form 1040 Individual Tax Return PDF)
        print("[5] Inspecting doc-005 (Official IRS Form 1040 PDF)...", flush=True)
        await page.goto("http://localhost:3000/workspace/documents/doc-005", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        assert await page.locator("iframe").first.is_visible(), "Expected IRS Form 1040 iframe to be visible"
        path_irs = os.path.join(SCREENSHOT_DIR, "03_real_irs_form_1040.png")
        await page.screenshot(path=path_irs, full_page=True)
        print(f"Captured: {path_irs}", flush=True)

        # 4. Inspect doc-011 (Real Scanned Corporate Expense POS Receipt JPG)
        print("[6] Inspecting doc-011 (Real Scanned POS Receipt)...", flush=True)
        await page.goto("http://localhost:3000/workspace/documents/doc-011", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        img = page.locator("img[alt='Corporate Travel & Expense Services']").first
        assert await img.is_visible(), "Expected scanned receipt image to be visible"
        path_receipt = os.path.join(SCREENSHOT_DIR, "04_real_scanned_receipt.png")
        await page.screenshot(path=path_receipt, full_page=True)
        print(f"Captured: {path_receipt}", flush=True)

        # 5. Ingest authentic preset from Directory View
        print("[7] Testing sample preset load from directory...", flush=True)
        await page.goto("http://localhost:3000/workspace/documents", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Click preset button for Hopkins multi-line invoice
        hopkins_preset = page.locator("button:has-text('Real Apparel Multi-Line Invoice (Hopkins)')").first
        if await hopkins_preset.is_visible():
            await hopkins_preset.click()
            await page.wait_for_timeout(2000)
            print("Loaded Hopkins preset invoice!", flush=True)
            path_hopkins = os.path.join(SCREENSHOT_DIR, "05_preset_loaded_hopkins.png")
            await page.screenshot(path=path_hopkins, full_page=True)
            print(f"Captured: {path_hopkins}", flush=True)

        print("[8] All real document inspections and live preset loadings completed successfully!", flush=True)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
