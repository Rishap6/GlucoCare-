"""
india_lab_templates.py
======================
OCR extraction templates for major Indian pathology labs.
Covers: Thyrocare, Dr Lal PathLabs, SRL Diagnostics, Metropolis,
        Apollo Diagnostics, Redcliffe Labs, Healthians, PathKind,
        Vijaya Diagnostics, Suburban Diagnostics + Generic fallback.

Usage:
    from india_lab_templates import detect_lab, extract_fields, assess_report

    text = "<raw OCR text from report image>"
    lab_name, template = detect_lab(text)
    fields = extract_fields(text, template)
    status = assess_report(fields)
    print(lab_name, fields, status)
"""

import re
from dataclasses import dataclass, field
from typing import Optional


# ─────────────────────────────────────────────
# DATA MODEL
# ─────────────────────────────────────────────

@dataclass
class ExtractedReport:
    lab_name:     str
    patient_name: Optional[str] = None
    patient_age:  Optional[str] = None
    patient_sex:  Optional[str] = None
    ref_by:       Optional[str] = None
    sample_id:    Optional[str] = None
    report_date:  Optional[str] = None
    # Key clinical values
    hba1c:        Optional[str] = None
    glucose_f:    Optional[str] = None   # fasting
    glucose_pp:   Optional[str] = None   # post-prandial
    glucose_rbs:  Optional[str] = None   # random
    haemoglobin:  Optional[str] = None
    wbc:          Optional[str] = None
    platelets:    Optional[str] = None
    tsh:          Optional[str] = None
    t3:           Optional[str] = None
    t4:           Optional[str] = None
    creatinine:   Optional[str] = None
    urea:         Optional[str] = None
    sgot:         Optional[str] = None
    sgpt:         Optional[str] = None
    bilirubin_t:  Optional[str] = None
    cholesterol:  Optional[str] = None
    triglycerides:Optional[str] = None
    hdl:          Optional[str] = None
    ldl:          Optional[str] = None
    uric_acid:    Optional[str] = None
    vitamin_d:    Optional[str] = None
    vitamin_b12:  Optional[str] = None
    sodium:       Optional[str] = None
    potassium:    Optional[str] = None
    calcium:      Optional[str] = None
    confidence:   dict = field(default_factory=dict)
    status:       str = "Pending"


# ─────────────────────────────────────────────
# SHARED GENERIC PATTERNS (used by all labs)
# ─────────────────────────────────────────────

GENERIC = {
    "patient_name": [
        r"(?i)patient\s*(?:name)?\s*[:\|]\s*([A-Za-z\s\.]+)",
        r"(?i)name\s*[:\|]\s*([A-Za-z\s\.]{3,40})",
        r"(?i)pt\.?\s*name\s*[:\|]\s*([A-Za-z\s\.]+)",
    ],
    "patient_age": [    
        r"(?i)age\s*[:\|]?\s*(\d{1,3})\s*(?:yrs?|years?)?",
        r"(\d{1,3})\s*(?:Yrs?|Years?)\s*/",
    ],
    "patient_sex": [
        r"(?i)sex\s*[:\|]\s*(Male|Female|M|F)",
        r"(?i)gender\s*[:\|]\s*(Male|Female|M|F)",
        r"/(Male|Female)/",
    ],
    "ref_by": [
        r"(?i)ref(?:erred)?\s*(?:by|dr\.?)\s*[:\|]?\s*([A-Za-z\s\.]+)",
        r"(?i)doctor\s*[:\|]\s*([A-Za-z\s\.]+)",
    ],
    "sample_id": [
        r"(?i)(?:sample|barcode|accession|order|lab)\s*(?:id|no\.?|number)\s*[:\|]?\s*([A-Z0-9\-]+)",
        r"(?i)B(?:arcode)?\s*[:\|]?\s*([A-Z0-9]{6,20})",
    ],
    "report_date": [
        r"(?i)(?:report|collection|test)\s*date\s*[:\|]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
        r"(\d{2}[\/\-]\d{2}[\/\-]\d{4})",
        r"(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})",
    ],
    "hba1c": [
        r"(?i)hb\s*a1\s*c\s*[:\|]?\s*([\d.]+)\s*%?",
        r"(?i)glycated\s*haemoglobin.*?([\d.]+)\s*%",
        r"(?i)a1c\s*[:\|]?\s*([\d.]+)",
    ],
    "glucose_f": [
        r"(?i)glucose\s*[,\-\s]*fasting\s*[:\|]?\s*([\d.]+)",
        r"(?i)fasting\s*(?:blood\s*)?glucose\s*[:\|]?\s*([\d.]+)",
        r"(?i)FBS\s*[:\|]?\s*([\d.]+)",
        r"(?i)F\.?\s*GLUCOSE\s*[:\|]?\s*([\d.]+)",
    ],
    "glucose_pp": [
        r"(?i)glucose.*?(?:PP|post\s*prandial)\s*[:\|]?\s*([\d.]+)",
        r"(?i)(?:PP|PPBS)\s*[:\|]?\s*([\d.]+)",
        r"(?i)post\s*meal.*?glucose.*?([\d.]+)",
    ],
    "glucose_rbs": [
        r"(?i)glucose.*?(?:RBS|random)\s*[:\|]?\s*([\d.]+)",
        r"(?i)random\s*blood\s*sugar\s*[:\|]?\s*([\d.]+)",
        r"(?i)RBS\s*[:\|]?\s*([\d.]+)",
    ],
    "haemoglobin": [
        r"(?i)h(?:a?e)?moglobin\s*[:\|]?\s*([\d.]+)",
        r"(?i)Hb\s*[:\|]?\s*([\d.]+)\s*g",
        r"(?i)HGB\s*[:\|]?\s*([\d.]+)",
    ],
    "wbc": [
        r"(?i)(?:total\s*)?(?:WBC|leucocytes|leukocytes)\s*[:\|]?\s*([\d.]+)",
        r"(?i)white\s*blood\s*(?:cell|count)\s*[:\|]?\s*([\d.]+)",
    ],
    "platelets": [
        r"(?i)platelet\s*(?:count)?\s*[:\|]?\s*([\d.]+)",
        r"(?i)PLT\s*[:\|]?\s*([\d.]+)",
        r"(?i)thrombocytes\s*[:\|]?\s*([\d.]+)",
    ],
    "tsh": [
        r"(?i)TSH\s*[:\|]?\s*([\d.]+)",
        r"(?i)thyroid\s*stimulating\s*hormone\s*[:\|]?\s*([\d.]+)",
    ],
    "t3": [
        r"(?i)\bT3\b\s*[:\|]?\s*([\d.]+)",
        r"(?i)tri.?iodo.?thyronine\s*[:\|]?\s*([\d.]+)",
    ],
    "t4": [
        r"(?i)\bT4\b\s*[:\|]?\s*([\d.]+)",
        r"(?i)thyroxine\s*[:\|]?\s*([\d.]+)",
    ],
    "creatinine": [
        r"(?i)creatinine\s*[:\|]?\s*([\d.]+)",
        r"(?i)CREAT\s*[:\|]?\s*([\d.]+)",
    ],
    "urea": [
        r"(?i)(?:blood\s*)?urea\s*(?:nitrogen)?\s*[:\|]?\s*([\d.]+)",
        r"(?i)BUN\s*[:\|]?\s*([\d.]+)",
    ],
    "sgot": [
        r"(?i)SGOT\s*[:\|]?\s*([\d.]+)",
        r"(?i)AST\s*[:\|]?\s*([\d.]+)",
        r"(?i)aspartate\s*amino.*?[:\|]?\s*([\d.]+)",
    ],
    "sgpt": [
        r"(?i)SGPT\s*[:\|]?\s*([\d.]+)",
        r"(?i)ALT\s*[:\|]?\s*([\d.]+)",
        r"(?i)alanine\s*amino.*?[:\|]?\s*([\d.]+)",
    ],
    "bilirubin_t": [
        r"(?i)bilirubin\s*[,\-\s]*total\s*[:\|]?\s*([\d.]+)",
        r"(?i)total\s*bilirubin\s*[:\|]?\s*([\d.]+)",
        r"(?i)T\.?\s*BILI\s*[:\|]?\s*([\d.]+)",
    ],
    "cholesterol": [
        r"(?i)(?:total\s*)?cholesterol\s*[:\|]?\s*([\d.]+)",
        r"(?i)CHOL\s*[:\|]?\s*([\d.]+)",
    ],
    "triglycerides": [
        r"(?i)triglycerides?\s*[:\|]?\s*([\d.]+)",
        r"(?i)TRIG\s*[:\|]?\s*([\d.]+)",
    ],
    "hdl": [
        r"(?i)HDL\s*[:\|]?\s*([\d.]+)",
        r"(?i)high\s*density\s*lipoprotein\s*[:\|]?\s*([\d.]+)",
    ],
    "ldl": [
        r"(?i)LDL\s*[:\|]?\s*([\d.]+)",
        r"(?i)low\s*density\s*lipoprotein\s*[:\|]?\s*([\d.]+)",
    ],
    "uric_acid": [
        r"(?i)uric\s*acid\s*[:\|]?\s*([\d.]+)",
        r"(?i)UA\s*[:\|]?\s*([\d.]+)",
    ],
    "vitamin_d": [
        r"(?i)vitamin\s*d\s*[,\-\s]*(?:25\s*oh|25-oh|total)?\s*[:\|]?\s*([\d.]+)",
        r"(?i)25\s*(?:oh|hydroxy)\s*(?:vitamin\s*)?d\s*[:\|]?\s*([\d.]+)",
        r"(?i)VIT\.?\s*D\s*[:\|]?\s*([\d.]+)",
    ],
    "vitamin_b12": [
        r"(?i)vitamin\s*b.?12\s*[:\|]?\s*([\d.]+)",
        r"(?i)cyanocobalamin\s*[:\|]?\s*([\d.]+)",
        r"(?i)VIT\.?\s*B12\s*[:\|]?\s*([\d.]+)",
    ],
    "sodium": [
        r"(?i)sodium\s*[:\|]?\s*([\d.]+)",
        r"(?i)\bNA\+?\b\s*[:\|]?\s*([\d.]+)",
    ],
    "potassium": [
        r"(?i)potassium\s*[:\|]?\s*([\d.]+)",
        r"(?i)\bK\+?\b\s*[:\|]?\s*([\d.]+)",
    ],
    "calcium": [
        r"(?i)calcium\s*[:\|]?\s*([\d.]+)",
        r"(?i)\bCA\+?\b\s*[:\|]?\s*([\d.]+)",
    ],
}


# ─────────────────────────────────────────────────────────────────
# LAB-SPECIFIC TEMPLATES
# Each adds extra/overriding patterns on top of GENERIC.
# 'keywords' = strings that identify the lab from raw OCR text.
# ─────────────────────────────────────────────────────────────────

LAB_TEMPLATES = {

    # ── 1. THYROCARE ──────────────────────────────────────────────
    "thyrocare": {
        "keywords": [
            "thyrocare", "aarogyam", "nazareth hospital",
            "thyrocare technologies", "thyrocare labs"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:BC|Order|Barcode)\s*[:\|#]?\s*([A-Z]?\d{8,12})",
                r"(?i)THYRO\s*[:\|#]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)report\s*date\s*[:\|]?\s*(\d{2}-\w{3}-\d{4})",
                r"(?i)collected\s*on\s*[:\|]?\s*(\d{2}/\d{2}/\d{4})",
            ],
            "hba1c": [
                r"HbA1c\s*\(IFCC\)\s*[:\|]?\s*([\d.]+)",
                r"(?i)Glyco?sylated\s*Hb\s*[:\|]?\s*([\d.]+)",
            ],
        },
        "notes": "Thyrocare uses Aarogyam packages. Reports often have 'BC:' barcode, "
                 "IFCC-standard HbA1c, and a centre code in header.",
    },

    # ── 2. DR LAL PATHLABS ────────────────────────────────────────
    "dr_lal": {
        "keywords": [
            "dr lal pathlabs", "dr. lal path labs", "drlal",
            "lal pathlabs", "lal path labs", "dr lal"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:Order|SID|Sample)\s*(?:Id|No\.?)\s*[:\|]?\s*([A-Z0-9\-]+)",
                r"(?i)Lab\s*No\.?\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)(?:Sample\s*Collected|Collection\s*Date)\s*[:\|]?\s*(\d{2}/\d{2}/\d{4})",
                r"(?i)Reported\s*on\s*[:\|]?\s*(\d{2}-[A-Za-z]{3}-\d{4})",
            ],
            "ref_by": [
                r"(?i)Ref\.\s*By\s*Dr\s*[:\|]?\s*([A-Za-z\s\.]+)",
                r"(?i)Referred\s*by\s*[:\|]?\s*([A-Za-z\s\.]+)",
            ],
        },
        "notes": "Dr Lal reports show 'Order Id', 'Sample Id', and 'Ref. By Dr'. "
                 "Header includes NABL logo and lab address.",
    },

    # ── 3. SRL DIAGNOSTICS ────────────────────────────────────────
    "srl": {
        "keywords": [
            "srl diagnostics", "srl world", "srl ltd",
            "dr avinash phadke", "srlworld"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:SRL\s*)?(?:Sample|Accession|Lab)\s*(?:Id|No\.?)\s*[:\|]?\s*([A-Z0-9\-]+)",
                r"(?i)Visit\s*Id\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)(?:Collection|Report)\s*Date\s*&?\s*Time\s*[:\|]?\s*(\d{2}/\d{2}/\d{4})",
            ],
            "patient_name": [
                r"(?i)Patient\s*Name\s*[:\|]\s*([A-Za-z\s\.]+)\s*(?:Age|Sex|Gender)",
            ],
        },
        "notes": "SRL reports often show 'Visit Id', collection date + time together, "
                 "and may include NABL/CAP accreditation number in footer.",
    },

    # ── 4. METROPOLIS HEALTHCARE ──────────────────────────────────
    "metropolis": {
        "keywords": [
            "metropolis", "metropolis healthcare", "metropolis labs",
            "metropolis india"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:Metropolis\s*)?(?:Report|Lab|Sample)\s*(?:Id|No\.?)\s*[:\|]?\s*([A-Z0-9\-]+)",
                r"(?i)Order\s*No\.?\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)Reported\s*[:\|]?\s*(\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2})",
                r"(?i)Collection\s*[:\|]?\s*(\d{2}/\d{2}/\d{4})",
            ],
            "haemoglobin": [
                r"(?i)Haemoglobin\s*\(Hb\)\s*[:\|]?\s*([\d.]+)",
            ],
        },
        "notes": "Metropolis reports are detailed with sub-sections. "
                 "Timestamps often appear with dates. Look for 'Order No.' in header.",
    },

    # ── 5. APOLLO DIAGNOSTICS ─────────────────────────────────────
    "apollo": {
        "keywords": [
            "apollo diagnostics", "apollo hospitals", "apollo health",
            "apollo path labs", "apollo diagnostic"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:Apollo\s*)?(?:Registration|Reg\.?|Accession)\s*(?:No\.?|Id)\s*[:\|]?\s*([A-Z0-9\-]+)",
                r"(?i)PID\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)Date\s*(?:of\s*)?Report\s*[:\|]?\s*(\d{2}/\d{2}/\d{4})",
                r"(?i)Received\s*(?:on)?\s*[:\|]?\s*(\d{2}-[A-Za-z]{3}-\d{4})",
            ],
            "ref_by": [
                r"(?i)Consulting\s*(?:Dr\.?|Doctor)\s*[:\|]?\s*([A-Za-z\s\.]+)",
            ],
        },
        "notes": "Apollo reports often use 'Registration No.' or 'PID'. "
                 "South India focused; look for Apollo Hospitals Group footer.",
    },

    # ── 6. REDCLIFFE LABS ─────────────────────────────────────────
    "redcliffe": {
        "keywords": [
            "redcliffe labs", "redcliffe diagnostics", "redcliffe"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)Order\s*Id\s*[:\|]?\s*([A-Z0-9\-]+)",
                r"(?i)Booking\s*Id\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)(?:Sample\s*Collected|Test)\s*(?:on|date)\s*[:\|]?\s*(\d{2}/\d{2}/\d{4})",
            ],
        },
        "notes": "Redcliffe is a newer lab (est. 2015), strong in tier-2 cities. "
                 "Reports use 'Order Id' and 'Booking Id'. Digital-first layout.",
    },

    # ── 7. HEALTHIANS ─────────────────────────────────────────────
    "healthians": {
        "keywords": [
            "healthians", "healthian", "health1ans"  # OCR may confuse 'i' and '1'
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)Healthians\s*(?:Order|Id)\s*[:\|]?\s*([A-Z0-9\-]+)",
                r"(?i)TXN\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)Collected\s*(?:on)?\s*[:\|]?\s*(\d{2}/\d{2}/\d{4})",
            ],
        },
        "notes": "Healthians is a home-collection focused platform. "
                 "Reports have clean digital layout with TXN ID or order number.",
    },

    # ── 8. PATHKIND LABS ──────────────────────────────────────────
    "pathkind": {
        "keywords": [
            "pathkind", "pathkind labs", "pathkind diagnostics",
            "mankind pharma"  # parent company
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:Sample|Lab|Accession)\s*(?:No\.?|Id)\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)Reg(?:istration)?\s*Date\s*[:\|]?\s*(\d{2}/\d{2}/\d{4})",
            ],
        },
        "notes": "PathKind is backed by Mankind Pharma. Reports are mid-tier in detail. "
                 "Look for 'Reg. Date' for collection date.",
    },

    # ── 9. VIJAYA DIAGNOSTIC CENTRE ──────────────────────────────
    "vijaya": {
        "keywords": [
            "vijaya diagnostic", "vijaya diagnostics", "vijaya health",
            "vijaya labs"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:Patient|Lab)\s*(?:Id|No\.?)\s*[:\|]?\s*([A-Z0-9\-]+)",
                r"(?i)Accession\s*No\.?\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)Reported\s*(?:on)?\s*[:\|]?\s*(\d{2}-\d{2}-\d{4})",
            ],
        },
        "notes": "Vijaya is South India focused (Hyderabad/Telangana). "
                 "Combined pathology + radiology reports. NABL accredited.",
    },

    # ── 10. SUBURBAN DIAGNOSTICS ─────────────────────────────────
    "suburban": {
        "keywords": [
            "suburban diagnostics", "suburban", "suburbandiag"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:Lab|Report)\s*No\.?\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)Reported\s*[:\|]?\s*(\d{2}/\d{2}/\d{4})",
            ],
        },
        "notes": "Suburban Diagnostics is strong in Mumbai/Maharashtra. "
                 "Focus on preventive packages and corporate health checks.",
    },

    # ── 11. NEUBERG DIAGNOSTICS ───────────────────────────────────
    "neuberg": {
        "keywords": [
            "neuberg", "neuberg diagnostics", "neuberg anand",
            "supratech", "ehrlich"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:Barcode|Sample|Lab)\s*(?:Id|No\.?)\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
        },
        "notes": "Neuberg (formerly Supratech/Ehrlich) has Pan-India presence. "
                 "Known for molecular and genetic testing.",
    },

    # ── 12. ONCQUEST LABORATORIES ─────────────────────────────────
    "oncquest": {
        "keywords": [
            "oncquest", "oncquest laboratories", "oncquest labs"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:Accession|Lab)\s*No\.?\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
        },
        "notes": "Oncquest specializes in oncology/cancer marker tests. "
                 "Reports may include tumour marker reference ranges.",
    },

    # ── 13. MAX HEALTHCARE / MAX LAB ─────────────────────────────
    "max_lab": {
        "keywords": [
            "max healthcare", "max lab", "max hospital",
            "max super speciality", "max labs"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:MRN|UHID|Reg\.?)\s*(?:No\.?)?\s*[:\|]?\s*([A-Z0-9\-]+)",
                r"(?i)Episode\s*(?:No\.?)?\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)(?:Collection|Sampling)\s*Date\s*[:\|]?\s*(\d{2}/\d{2}/\d{4})",
            ],
            "ref_by": [
                r"(?i)Ordering\s*(?:Physician|Dr\.?)\s*[:\|]?\s*([A-Za-z\s\.]+)",
            ],
        },
        "notes": "Max Lab reports are hospital-integrated. Use 'MRN' or 'UHID' for patient ID. "
                 "'Ordering Physician' instead of 'Ref. By'.",
    },

    # ── 14. MANIPAL HOSPITALS ─────────────────────────────────────
    "manipal": {
        "keywords": [
            "manipal hospital", "manipal labs", "manipal diagnostics",
            "manipal health"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)(?:MRD|IP|OP)\s*(?:No\.?)?\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
        },
        "notes": "Manipal is a major hospital chain in South/West India. "
                 "Reports use 'MRD No.' for patient ID.",
    },

    # ── 15. 1MG LABS ──────────────────────────────────────────────
    "1mg": {
        "keywords": [
            "1mg", "tata 1mg", "1mg labs", "tata health",
            "1 mg labs"
        ],
        "extra_patterns": {
            "sample_id": [
                r"(?i)Order\s*(?:Id|No\.?)\s*[:\|]?\s*([A-Z0-9\-]+)",
            ],
            "report_date": [
                r"(?i)Sample\s*Collected\s*[:\|]?\s*(\d{2}\s+\w+\s+\d{4})",
            ],
        },
        "notes": "1mg (now Tata 1mg) is a digital pharmacy + lab platform. "
                 "Partners with multiple backend labs — check footer for actual lab name.",
    },

}


# ─────────────────────────────────────────────
# CONFIDENCE SCORING
# ─────────────────────────────────────────────

FIELD_VALIDATORS = {
    "hba1c":        lambda v: 3.0 <= float(v) <= 15.0,
    "glucose_f":    lambda v: 40  <= float(v) <= 700,
    "glucose_pp":   lambda v: 50  <= float(v) <= 800,
    "glucose_rbs":  lambda v: 40  <= float(v) <= 800,
    "haemoglobin":  lambda v: 3.0 <= float(v) <= 22.0,
    "wbc":          lambda v: 1.0 <= float(v) <= 100.0,
    "platelets":    lambda v: 10  <= float(v) <= 1500,
    "tsh":          lambda v: 0.001 <= float(v) <= 200.0,
    "t3":           lambda v: 0.1  <= float(v) <= 10.0,
    "t4":           lambda v: 0.1  <= float(v) <= 50.0,
    "creatinine":   lambda v: 0.1  <= float(v) <= 30.0,
    "urea":         lambda v: 5    <= float(v) <= 400,
    "sgot":         lambda v: 1    <= float(v) <= 5000,
    "sgpt":         lambda v: 1    <= float(v) <= 5000,
    "bilirubin_t":  lambda v: 0.1  <= float(v) <= 50.0,
    "cholesterol":  lambda v: 50   <= float(v) <= 600,
    "triglycerides":lambda v: 20   <= float(v) <= 3000,
    "hdl":          lambda v: 5    <= float(v) <= 200,
    "ldl":          lambda v: 10   <= float(v) <= 600,
    "uric_acid":    lambda v: 1.0  <= float(v) <= 30.0,
    "vitamin_d":    lambda v: 1.0  <= float(v) <= 200.0,
    "vitamin_b12":  lambda v: 50   <= float(v) <= 3000,
    "sodium":       lambda v: 100  <= float(v) <= 200,
    "potassium":    lambda v: 1.5  <= float(v) <= 10.0,
    "calcium":      lambda v: 4    <= float(v) <= 20.0,
    "patient_name": lambda v: len(v.strip().split()) >= 2,
    "patient_age":  lambda v: 0    <= int(v)    <= 120,
    "report_date":  lambda v: bool(re.search(r"\d{2}.*\d{4}", v)),
}


def score_field(field_name: str, value: Optional[str]) -> float:
    """Returns confidence 0.0–1.0 for an extracted value."""
    if value is None or value.strip() == "":
        return 0.0
    validator = FIELD_VALIDATORS.get(field_name)
    if validator is None:
        return 0.7  # unknown field, partial confidence
    try:
        return 1.0 if validator(value.strip()) else 0.2
    except (ValueError, TypeError):
        return 0.1  # could not parse as number


# ─────────────────────────────────────────────
# CORE FUNCTIONS
# ─────────────────────────────────────────────

def detect_lab(text: str):
    """
    Returns (lab_key, template_dict) for the best matching lab,
    or ("generic", None) if no lab is identified.
    """
    text_lower = text.lower()
    for lab_key, tpl in LAB_TEMPLATES.items():
        if any(kw in text_lower for kw in tpl["keywords"]):
            return lab_key, tpl
    return "generic", None


def _try_patterns(text: str, patterns: list) -> Optional[str]:
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(1).strip()
    return None


def extract_fields(text: str, template: Optional[dict]) -> ExtractedReport:
    """
    Extracts all fields from OCR text using lab-specific + generic patterns.
    """
    lab_name, _ = detect_lab(text) if template is None else (None, None)
    if template is None:
        lab_name = "generic"
        extra = {}
    else:
        lab_name = [k for k, v in LAB_TEMPLATES.items() if v is template]
        lab_name = lab_name[0] if lab_name else "generic"
        extra = template.get("extra_patterns", {})

    report = ExtractedReport(lab_name=lab_name)

    for field_name in [f for f in ExtractedReport.__dataclass_fields__ if f not in ("lab_name", "confidence", "status")]:
        # Lab-specific patterns first, then generic
        specific = extra.get(field_name, [])
        generic  = GENERIC.get(field_name, [])
        value = _try_patterns(text, specific) or _try_patterns(text, generic)
        setattr(report, field_name, value)
        report.confidence[field_name] = score_field(field_name, value)

    return report


def assess_report(report: ExtractedReport) -> str:
    """
    Returns status string based on key field confidence scores.
    Sets report.status in place.
    """
    KEY_FIELDS = ["patient_name", "report_date"]
    # Add whichever glucose variant was found
    for g in ["hba1c", "glucose_f", "glucose_rbs", "glucose_pp"]:
        if report.confidence.get(g, 0) > 0:
            KEY_FIELDS.append(g)
            break

    scores = [report.confidence.get(f, 0.0) for f in KEY_FIELDS]
    avg = sum(scores) / len(scores) if scores else 0

    if avg >= 0.85:
        status = "✓ Good"
    elif avg >= 0.60:
        status = "⚠ Needs Review"
    else:
        status = "✗ Extraction Failed"

    report.status = status
    return status


# ─────────────────────────────────────────────
# PIPELINE — USE THIS IN YOUR APP
# ─────────────────────────────────────────────

def process_report(ocr_text: str) -> ExtractedReport:
    """
    Full pipeline: detect lab → extract fields → score → assess.

    Example:
        report = process_report(ocr_text)
        print(report.lab_name, report.hba1c, report.status)
    """
    lab_name, template = detect_lab(ocr_text)
    report = extract_fields(ocr_text, template)
    assess_report(report)
    return report


# ─────────────────────────────────────────────
# QUICK TEST
# ─────────────────────────────────────────────

if __name__ == "__main__":
    sample_text = """
    THYROCARE TECHNOLOGIES LIMITED
    Nazareth Hospital, Aarey Colony
    BC: 1234567890
    Patient Name: Rajesh Kumar
    Age: 45 Yrs / Male
    Ref. Dr: Dr. Sharma
    Report Date: 12-Apr-2025

    HbA1c (IFCC): 7.2 %
    Glucose - Fasting: 118 mg/dL
    TSH: 2.45 uIU/mL
    Haemoglobin: 13.4 g/dL
    Total Cholesterol: 198 mg/dL
    Triglycerides: 145 mg/dL
    HDL: 48 mg/dL
    LDL: 121 mg/dL
    Vitamin D (25 OH): 22.3 ng/mL
    Vitamin B12: 310 pg/mL
    """

    report = process_report(sample_text)
    print(f"\nLab detected : {report.lab_name}")
    print(f"Patient      : {report.patient_name}  ({report.patient_age})")
    print(f"Date         : {report.report_date}")
    print(f"HbA1c        : {report.hba1c}   conf={report.confidence.get('hba1c')}")
    print(f"Glucose(F)   : {report.glucose_f}  conf={report.confidence.get('glucose_f')}")
    print(f"TSH          : {report.tsh}  conf={report.confidence.get('tsh')}")
    print(f"Vit D        : {report.vitamin_d}  conf={report.confidence.get('vitamin_d')}")
    print(f"\nStatus       : {report.status}")
    print(f"\nAll confidence scores:")
    for k, v in report.confidence.items():
        bar = "█" * int(v * 10) + "░" * (10 - int(v * 10))
        print(f"  {k:<16} {bar}  {v:.1f}")
