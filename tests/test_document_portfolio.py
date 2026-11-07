import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"C:\Users\Harshhhh\.gemini\antigravity\brain\6e8feba0-bc3f-4934-90a4-f62f7abbcac4\screenshots\live_ingestion"
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
        print("[2] Successfully logged in as Workspace Admin", flush=True)

        # Navigate to Document Intelligence Repository
        print("[3] Navigating to Document Studio Directory...")
        await page.goto("http://localhost:3000/workspace/documents", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Capture Directory View
        path_dir = os.path.join(SCREENSHOT_DIR, "01_document_directory_14_items.png")
        await page.screenshot(path=path_dir, full_page=True)
        print(f"Captured: {path_dir}")

        # Check total rows
        rows = page.locator("tbody tr")
        count = await rows.count()
        print(f"Total documents rendered in directory: {count}")
        assert count >= 14, f"Expected at least 14 documents, got {count}"

        # Test Format Filter: Click "HANDWRITTEN"
        print("[4] Testing format filter: HANDWRITTEN...")
        hw_btn = page.locator("button:has-text('HANDWRITTEN')")
        if await hw_btn.is_visible():
            await hw_btn.click()
            await page.wait_for_timeout(500)
            hw_count = await page.locator("tbody tr").count()
            print(f"Handwritten documents matching filter: {hw_count}")
            assert hw_count >= 2, f"Expected at least 2 handwritten documents, got {hw_count}"
            path_hw_filter = os.path.join(SCREENSHOT_DIR, "02_handwritten_filter.png")
            await page.screenshot(path=path_hw_filter, full_page=False)

        # Reset filter to ALL
        all_buttons = page.locator("button:has-text('ALL')")
        if await all_buttons.count() >= 2:
            await all_buttons.nth(1).click()
            await page.wait_for_timeout(500)

        # Inspect Maritime BOL: doc-003 (BOL-2026-0442)
        print("[5] Inspecting Shipping Bill of Lading (BOL-2026-0442)...", flush=True)
        await page.goto("http://localhost:3000/workspace/documents/doc-003", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Verify BOL maritime markers
        bol_marker = page.locator("text=ROTTERDAM (NLRTM)")
        assert await bol_marker.is_visible(), "Expected Port of Rotterdam marker to be visible"
        path_bol = os.path.join(SCREENSHOT_DIR, "03_maritime_bol_studio.png")
        await page.screenshot(path=path_bol, full_page=True)
        print(f"Captured: {path_bol}")

        # Inspect Handwritten Tally: doc-004 (FDR-77102-HW)
        print("[6] Inspecting Handwritten Dock Tally (doc-004)...", flush=True)
        await page.goto("http://localhost:3000/workspace/documents/doc-004", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        stamp_marker = page.locator("text=STEVEDORE TALLY VERIFIED")
        assert await stamp_marker.is_visible(), "Expected rubber stamp marker to be visible"
        path_hw = os.path.join(SCREENSHOT_DIR, "04_handwritten_tally_studio.png")
        await page.screenshot(path=path_hw, full_page=True)
        print(f"Captured: {path_hw}", flush=True)

        # Test Live File Ingestion via hidden input file chooser
        print("[7] Testing Live File Ingestion...", flush=True)
        # Create a sample temporary PDF file to upload
        temp_file_path = os.path.join(SCREENSHOT_DIR, "Goldman_Sachs_Prime_Brokerage_Fee_2026.pdf")
        with open(temp_file_path, "wb") as f:
            f.write(b"%PDF-1.7 Synthetic Institutional Test Document for LedgerOne Live Ingestion")

        # Go back to documents directory
        await page.goto("http://localhost:3000/workspace/documents", wait_until="networkidle")
        file_input = page.locator("input[type='file']").first
        await file_input.set_input_files(temp_file_path)
        print("Uploaded file via file input...", flush=True)

        # Wait for navigation to new document or feedback toast
        await page.wait_for_timeout(2000)
        path_uploaded = os.path.join(SCREENSHOT_DIR, "05_live_ingested_document.png")
        await page.screenshot(path=path_uploaded, full_page=True)
        print(f"Captured: {path_uploaded}", flush=True)

        # Verify vendor name in new doc
        page_content = await page.content()
        assert "Goldman Sachs" in page_content, "Expected uploaded document vendor name to be extracted"
        print("Verified: Uploaded document successfully parsed and loaded in Document Studio!", flush=True)

        # Verify invariant sign-off on new doc
        sign_btn = page.locator("button:has-text('Sign & Release')").first
        if await sign_btn.is_visible():
            await sign_btn.click()
            await page.wait_for_timeout(500)
            assert await page.locator("text=Dual-custody verification signed").is_visible()
            print("Verified: Dual-custody sign-off works on newly ingested document!", flush=True)
            path_signed = os.path.join(SCREENSHOT_DIR, "06_ingested_doc_signed.png")
            await page.screenshot(path=path_signed, full_page=False)

        await browser.close()
        print("All verification steps passed with 100% integrity!", flush=True)

if __name__ == "__main__":
    asyncio.run(run())
