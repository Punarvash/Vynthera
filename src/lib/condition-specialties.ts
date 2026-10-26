import { abbreviationSynonyms } from "./condition-synonyms";

/**
 * Which specialties usually treat a condition, as CMS names prescriber types in the Medicare data.
 * Matched on words in the condition (and its expansions), most specific first; primary care is added last
 * where it commonly manages the condition.
 */
const RULES: [RegExp, string[]][] = [
  [/\b(cancer|carcinoma|tumou?r|neoplasm|lymphoma|leukemia|myeloma|melanoma|sarcoma|glioma|metasta)/, ["Hematology-Oncology", "Medical Oncology"]],
  [/\b(anemia|hemophilia|sickle cell|thrombocytopenia|neutropenia|myelodysplastic)/, ["Hematology-Oncology", "Hematology"]],
  [/\b(heart|cardiac|coronary|atrial|arrhythmia|hypertension|blood pressure|angina|myocardial|cholesterol|hyperlipid|hypercholesterol|dyslipid|cardiomyopathy)/, ["Cardiology", "Internal Medicine", "Family Practice"]],
  [/\b(thrombosis|embolism|thromboembolism|anticoagula)/, ["Cardiology", "Hematology-Oncology", "Internal Medicine"]],
  [/\b(diabetes|thyroid|hypothyroid|hyperthyroid|obesity|weight|adrenal|cushing|pituitary|osteoporosis|growth hormone)/, ["Endocrinology", "Internal Medicine", "Family Practice"]],
  [/\b(polycystic ovary|pcos|endometriosis|menopause|infertility|pregnan|contracepti|uterine|vaginal|menstrua|preeclampsia)/, ["Obstetrics & Gynecology", "Endocrinology"]],
  [/\b(rheumatoid|lupus|gout|spondyl|psoriatic arthritis|vasculitis|sjogren|scleroderma|polymyalgia|arthritis)/, ["Rheumatology", "Internal Medicine"]],
  [/\b(psoriasis|acne|dermatitis|eczema|rosacea|hidradenitis|urticaria|vitiligo|alopecia|skin)/, ["Dermatology"]],
  [/\b(crohn|colitis|inflammatory bowel|ibd|reflux|gerd|irritable bowel|cirrhosis|hepatitis|liver|pancreatitis|celiac|ulcer|pylori|nash|mash)/, ["Gastroenterology", "Internal Medicine"]],
  [/\b(asthma|copd|pulmonary|lung|bronch|emphysema|cystic fibrosis|sleep apnea|pneumonia)/, ["Pulmonary Disease", "Internal Medicine", "Family Practice"]],
  [/\b(hiv|aids|tuberculosis|sepsis|meningitis|endocarditis|osteomyelitis|lyme|fungal|covid|influenza)/, ["Infectious Disease", "Internal Medicine"]],
  [/\b(strep|pharyngitis|tonsillitis|sinusitis|otitis|ear infection|throat)/, ["Family Practice", "Pediatric Medicine", "Otolaryngology"]],
  [/\b(urinary tract|uti|cystitis|pyelonephritis|prostat|bladder|erectile|kidney stone|incontinence)/, ["Urology", "Family Practice", "Internal Medicine"]],
  [/\b(kidney|renal|nephr|dialysis)/, ["Nephrology", "Internal Medicine"]],
  [/\b(depress|anxiety|bipolar|schizophren|psychos|adhd|attention deficit|ptsd|obsessive|panic|insomnia|substance|alcohol use|opioid use|eating disorder|autism)/, ["Psychiatry", "Family Practice"]],
  [/\b(migraine|headache|epilep|seizure|parkinson|alzheimer|dementia|multiple sclerosis|neuropathy|stroke|amyotrophic|myasthenia|huntington|restless legs)/, ["Neurology", "Internal Medicine"]],
  [/\b(glaucoma|macular|keratoconus|retin|cataract|uveitis|conjunctivitis|dry eye|eye)/, ["Ophthalmology", "Optometry"]],
  [/\b(allerg|rhinitis|anaphyla|angioedema|immunodeficiency)/, ["Allergy/ Immunology", "Otolaryngology"]],
  [/\b(pain|fibromyalgia|back)/, ["Pain Management", "Physical Medicine and Rehabilitation", "Family Practice"]],
  [/\b(cellulitis|impetigo|skin infection|abscess|wound)/, ["Family Practice", "Infectious Disease", "Dermatology"]],
];

export function specialtiesFor(condition: string | undefined): string[] {
  if (!condition) return [];
  const text = [condition, ...abbreviationSynonyms(condition)].join(" ").toLowerCase();
  const out: string[] = [];
  for (const [re, specialties] of RULES) if (re.test(text)) for (const s of specialties) if (!out.includes(s)) out.push(s);
  return out.slice(0, 4);
}
