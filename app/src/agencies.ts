// One plain sentence per agency, for people who don't know what these do.
const DESCRIPTIONS: [RegExp, string][] = [
  [/\bnavy\b|marine corps/i, "The Navy buys ships, submarines, aircraft and the systems that run them."],
  [/\barmy\b/i, "The Army buys vehicles, weapons, ammunition, equipment and services for soldiers."],
  [/air force|space force/i, "The Air Force and Space Force buy aircraft, missiles, satellites and rockets."],
  [/defense logistics/i, "The Defense Logistics Agency buys fuel, food, medicine and spare parts for the whole military."],
  [/missile defense/i, "The Missile Defense Agency builds systems meant to shoot down incoming missiles."],
  [/special operations/i, "Special Operations Command equips units like the Navy SEALs and Army Rangers."],
  [/defense health/i, "The Defense Health Agency runs military hospitals and health insurance for service members."],
  [/defense information systems/i, "The Defense Information Systems Agency runs the military's computer networks."],
  [/darpa|advanced research projects/i, "DARPA funds early research into new military technology."],
  [/defense|\bwar\b|pentagon/i, "The Department of Defense buys everything the military uses, from software to warships."],
  [/veterans/i, "The Department of Veterans Affairs runs hospitals and benefits for former service members, and buys medical supplies, drugs and construction."],
  [/aeronautics|nasa/i, "NASA buys rockets, spacecraft, science instruments and launch services."],
  [/homeland|customs|immigration|fema|coast guard|transportation security/i, "The Department of Homeland Security covers border control, airport screening, disaster relief and the Coast Guard."],
  [/\benergy\b/i, "The Department of Energy runs the national laboratories and the nuclear weapons complex, and funds energy research."],
  [/health and human|hhs|food and drug|disease control|medicare|medicaid|national institutes/i, "Health and Human Services covers Medicare, the FDA, the CDC and medical research, and buys vaccines and drugs."],
  [/treasury|internal revenue/i, "The Treasury Department collects taxes, pays the government's bills and manages its finances."],
  [/general services/i, "The General Services Administration buys office space, technology and supplies for other agencies."],
  [/transportation|aviation|highway/i, "The Department of Transportation covers highways, air traffic control and transit."],
  [/agriculture/i, "The Department of Agriculture covers farming programs, food aid and rural services."],
  [/justice|investigation|prisons|marshals/i, "The Justice Department includes the FBI, federal prisons and U.S. attorneys."],
  [/\bstate\b|international development/i, "The State Department runs embassies and foreign aid."],
  [/interior|land management|national park/i, "The Interior Department manages national parks, public lands and natural resources."],
  [/\blabor\b/i, "The Labor Department covers job training, workplace safety and unemployment programs."],
  [/education/i, "The Education Department funds schools and student aid."],
  [/social security/i, "Social Security pays retirement and disability benefits to millions of people."],
  [/commerce|census|patent|oceanic/i, "The Commerce Department includes the Census, the Patent Office and the weather service."],
];

export function agencyDescription(agency: string, subAgency?: string): string | null {
  for (const text of [subAgency, agency]) {
    if (!text) continue;
    for (const [re, desc] of DESCRIPTIONS) if (re.test(text)) return desc;
  }
  return null;
}
