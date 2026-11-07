import os
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIRS = [
    r"d:\Projects\LedgerOne\sample_documents",
    r"d:\Projects\LedgerOne\frontend\public\samples"
]

for d in OUTPUT_DIRS:
    os.makedirs(d, exist_ok=True)

def draw_header(draw, title, ref, subtitle=""):
    draw.rectangle([(20, 20), (1180, 120)], fill="#0f172a", outline="#38bdf8", width=2)
    draw.text((40, 35), title, fill="#38bdf8")
    draw.text((40, 65), subtitle, fill="#94a3b8")
    draw.text((900, 45), f"REF: {ref}", fill="#f8fafc")

def save_document(img, base_name, as_pdf=True, as_png=True, as_tiff=False):
    for out_dir in OUTPUT_DIRS:
        if as_pdf:
            pdf_path = os.path.join(out_dir, f"{base_name}.pdf")
            img.save(pdf_path, "PDF", resolution=150.0)
            print(f"Generated: {pdf_path}")
        if as_png:
            png_path = os.path.join(out_dir, f"{base_name}.png")
            img.save(png_path, "PNG")
            print(f"Generated: {png_path}")
        if as_tiff:
            tif_path = os.path.join(out_dir, f"{base_name}.tiff")
            img.save(tif_path, "TIFF")
            print(f"Generated: {tif_path}")

# 1. GSA Schedule 70 IT Contract Form 1449
img1 = Image.new("RGB", (1200, 1600), color="#ffffff")
d1 = ImageDraw.Draw(img1)
draw_header(d1, "GSA SCHEDULE 70 (IT-70) COMMERCIAL INVOICE — FORM 1449", "GS-35F-0119Y", "US General Services Administration Federal Supply Service")
d1.rectangle([(40, 140), (1160, 260)], outline="#cbd5e1", width=1)
d1.text((60, 160), "CONTRACTOR: High-Performance Storage Systems (CAGE: 3A1V8)", fill="#0f172a")
d1.text((60, 185), "ORDERING AGENCY: Department of Energy / National Laboratories", fill="#475569")
d1.text((60, 210), "DELIVERY DESTINATION: High Performance Computing Center, Oak Ridge, TN", fill="#475569")
d1.text((800, 160), "ORDER NO: 47QTCA26F0091", fill="#0f172a")
d1.text((800, 185), "DATE: November 4, 2026", fill="#475569")
d1.text((800, 210), "TERMS: Net 30 Prompt Payment Act", fill="#475569")

# Line Items Table
d1.rectangle([(40, 280), (1160, 320)], fill="#f1f5f9", outline="#cbd5e1")
d1.text((60, 295), "SIN / ITEM", fill="#0f172a")
d1.text((250, 295), "DESCRIPTION", fill="#0f172a")
d1.text((700, 295), "QTY", fill="#0f172a")
d1.text((820, 295), "UNIT PRICE (USD)", fill="#0f172a")
d1.text((1020, 295), "TOTAL AMOUNT", fill="#0f172a")

items1 = [
    ("SIN 132-8", "DirectFlash NVMe 75TB PCIe Gen4 Module Array", "4 EA", "$62,500.00", "$250,000.00"),
    ("SIN 132-8", "100GbE QSFP28 Dual-Port Storage Fabric Transceivers", "16 EA", "$3,903.13", "$62,450.00"),
    ("SIN 132-34", "GSA Gold 24/7/365 Hardware Mission Support Retainer", "1 YR", "$25,777.13", "$25,777.13")
]
y = 340
for sin, desc, qty, u, t in items1:
    d1.text((60, y), sin, fill="#334155")
    d1.text((250, y), desc, fill="#0f172a")
    d1.text((700, y), qty, fill="#334155")
    d1.text((820, y), u, fill="#334155")
    d1.text((1020, y), t, fill="#0f172a")
    d1.line([(40, y+30), (1160, y+30)], fill="#e2e8f0")
    y += 45

d1.rectangle([(750, y+40), (1160, y+180)], fill="#f8fafc", outline="#cbd5e1")
d1.text((780, y+60), "SUBTOTAL:", fill="#475569")
d1.text((1000, y+60), "$312,450.00", fill="#0f172a")
d1.text((780, y+90), "GSA INDUSTRIAL REBATE / TAX:", fill="#475569")
d1.text((1000, y+90), "$25,777.13", fill="#0f172a")
d1.text((780, y+130), "TOTAL INVOICE DUE:", fill="#0f172a")
d1.text((1000, y+130), "$338,227.13", fill="#0f172a")
save_document(img1, "GSA_Schedule_IT70_Contract_Invoice", as_pdf=True, as_png=True)

# 2. FIATA Multimodal Ocean Bill of Lading Form FBL-004819
img2 = Image.new("RGB", (1200, 1600), color="#f8fafc")
d2 = ImageDraw.Draw(img2)
draw_header(d2, "FIATA MULTIMODAL TRANSPORT BILL OF LADING — FBL 004819", "BOL-2026-0442", "Negotiable FIATA Multimodal Transport Bill of Lading (ICC/UNCTAD Rules)")
d2.rectangle([(40, 140), (1160, 300)], outline="#0284c7", width=2)
d2.text((60, 160), "SHIPPER: Intercontinental Refrigerated Logistics B.V., Rotterdam", fill="#0f172a")
d2.text((60, 190), "CONSIGNEE: Pacific Cold Chain Logistics PTE LTD, Singapore", fill="#0f172a")
d2.text((60, 220), "PORT OF LOADING: Rotterdam (UN/LOCODE: NLRTM)", fill="#0369a1")
d2.text((60, 250), "PORT OF DISCHARGE: Singapore Jurong Terminal (UN/LOCODE: SGSIN)", fill="#0369a1")
d2.text((700, 160), "VESSEL / VOYAGE: MAERSK MC-KINNEY / 2604E", fill="#0f172a")
d2.text((700, 190), "CONTAINER NO: MSKU-881920-1 (40ft High-Cube Reefer)", fill="#0f172a")
d2.text((700, 220), "CARRIER SEAL: MSK-99210-SEC", fill="#0f172a")
d2.text((700, 250), "TARE: 4,200 KG | GROSS: 28,400 KG", fill="#475569")

# Maritime Items
d2.rectangle([(40, 320), (1160, 360)], fill="#e0f2fe", outline="#0284c7")
d2.text((60, 335), "FREIGHT CHARGES & SURCHARGES (USD)", fill="#0369a1")
d2.text((1020, 335), "AMOUNT", fill="#0369a1")

items2 = [
    ("40ft High-Cube Ocean Freight (Rotterdam to Singapore)", "$42,500.00"),
    ("Low-Sulfur IMO-2020 Bunker Adjustment Factor (BAF)", "$3,850.00"),
    ("Port Handling & Jurong Wharfage Security Fees", "$1,650.00"),
    ("Port Container Demurrage Surcharge (Disputed Variance +$632.00)", "$5,120.00")
]
y2 = 380
for desc, amt in items2:
    d2.text((60, y2), desc, fill="#0f172a")
    d2.text((1020, y2), amt, fill="#0f172a")
    d2.line([(40, y2+25), (1160, y2+25)], fill="#cbd5e1")
    y2 += 40

d2.rectangle([(750, y2+40), (1160, y2+160)], fill="#ffffff", outline="#0284c7", width=2)
d2.text((780, y2+60), "BASE CHARGES SUM:", fill="#475569")
d2.text((1000, y2+60), "$52,488.00", fill="#475569")
d2.text((780, y2+100), "TOTAL FREIGHT DUE:", fill="#0369a1")
d2.text((1000, y2+100), "$53,120.00", fill="#0369a1")
save_document(img2, "FIATA_Ocean_Bill_of_Lading_FBL004819", as_pdf=True, as_png=True)

# 3. PSA Cargo Tally Sheet (Handwritten / Scanned)
img3 = Image.new("RGB", (1200, 1600), color="#fef3c7")
d3 = ImageDraw.Draw(img3)
d3.rectangle([(20, 20), (1180, 120)], fill="#78350f", outline="#d97706", width=2)
d3.text((40, 35), "PORT OF SINGAPORE AUTHORITY — STEVEDORING TALLY SHEET", fill="#fef3c7")
d3.text((40, 65), "PSA Marine Operations Division • Form ST-04 (Jurong Gateway Terminal)", fill="#fde68a")
d3.text((850, 45), "TALLY NO: PSA-77102-HW", fill="#ffffff")

# Tally rows
d3.text((60, 160), "VESSEL BERTH: J8 JURONG TERMINAL", fill="#78350f")
d3.text((60, 190), "STEVEDORE GANG: GANG A (12 CRANE & RIGGING OPERATORS)", fill="#78350f")
d3.text((60, 220), "SHIFT: NIGHT SHIFT 20:00 - 04:00", fill="#78350f")

d3.rectangle([(40, 260), (1160, 480)], outline="#b45309", width=2)
d3.text((60, 280), "1. Wharfage Stevedoring Labor: 12 Men x $450/shift = $5,400.00", fill="#78350f")
d3.text((60, 330), "2. Heavy Shore Crane Rigging (Tandem 120T Hook) = $1,624.00", fill="#78350f")
d3.text((60, 380), "TOTAL PHYSICAL LABOR BILLING = $7,024.00", fill="#78350f")

# Rubber Stamp simulation
d3.rectangle([(680, 520), (1120, 660)], outline="#b91c1c", width=4)
d3.text((700, 545), "PORT AUTHORITY OF SINGAPORE", fill="#b91c1c")
d3.text((700, 575), "PHYSICAL INSPECTION VERIFIED", fill="#b91c1c")
d3.text((700, 605), "BERTH MASTER: CHEN W. / AUDITED", fill="#b91c1c")
save_document(img3, "PSA_Port_Authority_Wharf_Tally_ST04", as_pdf=True, as_png=True)

# 4. Global Treasury Settlement Fee 2026 (Neutral Generic Institutional)
img4 = Image.new("RGB", (1200, 1600), color="#ffffff")
d4 = ImageDraw.Draw(img4)
draw_header(d4, "GLOBAL TREASURY & CLEARING SETTLEMENT SCHEDULE", "GTC-2026-9921", "Institutional Custody & Multi-Asset Settlement Services")
d4.rectangle([(40, 140), (1160, 250)], outline="#cbd5e1", width=1)
d4.text((60, 160), "ENTITY: Institutional Global Clearing Corporation", fill="#0f172a")
d4.text((60, 190), "SETTLEMENT ACCOUNT: GTC-SEC-TREASURY-01", fill="#475569")
d4.text((800, 160), "VALUE DATE: November 7, 2026", fill="#0f172a")
d4.text((800, 190), "CURRENCY: USD", fill="#475569")

d4.rectangle([(40, 280), (1160, 320)], fill="#f8fafc", outline="#cbd5e1")
d4.text((60, 295), "SERVICE SPECIFICATION", fill="#0f172a")
d4.text((1020, 295), "SETTLED AMOUNT", fill="#0f172a")

items4 = [
    ("Global Custody Asset Safekeeping & Administration Retainer", "$68,450.00"),
    ("Tri-Party Repo Collateral Valuation & Triparty Agent Settlement", "$38,000.00"),
    ("Automated Straight-Through Clearing Network Access Allocation", "$22,000.00")
]
y4 = 340
for desc, amt in items4:
    d4.text((60, y4), desc, fill="#0f172a")
    d4.text((1020, y4), amt, fill="#0f172a")
    d4.line([(40, y4+25), (1160, y4+25)], fill="#e2e8f0")
    y4 += 45

d4.rectangle([(750, y4+40), (1160, y4+140)], fill="#f1f5f9", outline="#cbd5e1")
d4.text((780, y4+60), "SUBTOTAL:", fill="#475569")
d4.text((1000, y4+60), "$128,450.00", fill="#0f172a")
d4.text((780, y4+100), "TOTAL DUE:", fill="#0f172a")
d4.text((1000, y4+100), "$128,450.00", fill="#0f172a")
save_document(img4, "Global_Treasury_Settlement_Fee_2026", as_pdf=True, as_png=True)

# 5. FCC Telecom Statement
img5 = Image.new("RGB", (1200, 1600), color="#ffffff")
d5 = ImageDraw.Draw(img5)
draw_header(d5, "FCC FORM 499-A CARRIER DEDICATED CIRCUIT BILLING", "FCC-2026-1108", "Federal Communications Commission Universal Service Contributor Schedule")
d5.rectangle([(40, 140), (1160, 260)], outline="#cbd5e1", width=1)
d5.text((60, 160), "CIRCUIT ID: WAV-100G-NYC-LON-001 (Transatlantic Dense Wavelength Subsea)", fill="#0f172a")
d5.text((60, 190), "CROSS-CONNECT: NY4 Equinix Secaucus Meet-Me Room", fill="#475569")
d5.text((800, 160), "BILLING CYCLE: October 2026", fill="#0f172a")
d5.text((800, 190), "DUE DATE: Net 15 Days", fill="#475569")

items5 = [
    ("100Gbps Dedicated DWDM Optical Wavelength Circuit Lease", "$18,500.00"),
    ("Carrier Neutral Facility Cross-Connect Port Connection (NY4 / LD4)", "$2,400.00"),
    ("Federal Universal Service Fund (USF) Statutory Assessment (34.5%)", "$3,348.00")
]
y5 = 300
for desc, amt in items5:
    d5.text((60, y5), desc, fill="#0f172a")
    d5.text((1020, y5), amt, fill="#0f172a")
    d5.line([(40, y5+25), (1160, y5+25)], fill="#e2e8f0")
    y5 += 45

d5.rectangle([(750, y5+30), (1160, y5+120)], fill="#f8fafc", outline="#cbd5e1")
d5.text((780, y5+50), "SUBTOTAL:", fill="#475569")
d5.text((1000, y5+50), "$20,900.00", fill="#475569")
d5.text((780, y5+80), "TOTAL CHARGES:", fill="#0f172a")
d5.text((1000, y5+80), "$24,248.00", fill="#0f172a")
save_document(img5, "FCC_Transatlantic_DWDM_Telecom_Statement", as_pdf=True, as_png=True)

# 6. IATA Fuel Ticket JIG-7
img6 = Image.new("RGB", (1200, 1600), color="#f8fafc")
d6 = ImageDraw.Draw(img6)
draw_header(d6, "IATA JIG-7 HYDRANT FUEL BUNKED CUSTODY TICKET", "JIG-SIN-26081", "Joint Inspection Group Aviation Quality Control Standard Form 7")
d6.text((60, 150), "AIRPORT: Singapore Changi International Airport (SIN / WSSS)", fill="#0f172a")
d6.text((60, 180), "HYDRANT DISPENSER PIT: TERMINAL 3 / BAY B4", fill="#475569")
d6.text((60, 210), "FUEL GRADE: Aviation Kerosene Jet-A1 (DEF STAN 91-091)", fill="#475569")
d6.text((800, 150), "DENSITY @ 15°C: 0.804 kg/L", fill="#0f172a")
d6.text((800, 180), "TEMPERATURE: 28.4°C", fill="#475569")

items6 = [
    ("Aviation Jet-A1 Bulk Fuel Dispensing (42,000 Gallons @ $2.85/gal)", "$119,700.00"),
    ("Airport Into-Plane Throughput & Airport Authority Wharfage", "$0.00"),
    ("Spot FX Currency Spread Adjustment (Exceeded Tolerance INV-004)", "$220.00")
]
y6 = 260
for desc, amt in items6:
    d6.text((60, y6), desc, fill="#0f172a")
    d6.text((1020, y6), amt, fill="#0f172a")
    d6.line([(40, y6+25), (1160, y6+25)], fill="#e2e8f0")
    y6 += 45

d6.rectangle([(750, y6+30), (1160, y6+120)], fill="#ffffff", outline="#cbd5e1")
d6.text((780, y6+50), "BASE FUEL CHARGE:", fill="#475569")
d6.text((1000, y6+50), "$119,700.00", fill="#475569")
d6.text((780, y6+80), "TOTAL INVOICE DUE:", fill="#0f172a")
d6.text((1000, y6+80), "$119,920.00", fill="#0f172a")
save_document(img6, "IATA_JetA1_Hydrant_Fuel_Ticket_JIG7", as_pdf=True, as_png=True, as_tiff=True)

print("All sample documents successfully generated!")
