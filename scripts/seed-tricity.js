/*
 * Seed demo profiles around Mohali / Chandigarh / Panchkula.
 *
 * Written against what discovery actually requires, which is stricter
 * than "a row in profiles". refresh_discovery_pool() only considers a
 * candidate with coordinates, a name, published_at set, a compatible
 * gender pair, and activity inside fairness_settings.dormant_after.
 * Miss any one and the profile exists but never appears in a deck,
 * which is the failure mode worth avoiding here.
 *
 * profiles.user_id references auth.users, so each one needs a real auth
 * user. A trigger creates the profile row on signup, so this updates
 * rather than inserts.
 *
 * Every seeded account is marked: email @tickle.seed, and seed:true in
 * the draft column. That is what makes them findable and removable
 * later, and it is the difference between demo data and litter.
 */

const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const env = {};
fs.readFileSync(".env", "utf8")
  .split(/\r?\n/)
  .forEach((line) => {
    const match = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  });

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/*
 * Where they are.
 *
 * Real neighbourhood centres rather than one pin per city, so the deck
 * shows a spread of distances instead of everybody at exactly 4.2 km.
 * Each gets a jitter radius in degrees (~0.01 deg is roughly 1.1 km).
 */
const AREAS = [
  { city: "Mohali", lat: 30.7046, lng: 76.7179, jitter: 0.022 },
  { city: "Mohali", lat: 30.6872, lng: 76.6887, jitter: 0.02 },
  { city: "Chandigarh", lat: 30.7333, lng: 76.7794, jitter: 0.025 },
  { city: "Chandigarh", lat: 30.7411, lng: 76.7681, jitter: 0.02 },
  { city: "Panchkula", lat: 30.6942, lng: 76.8606, jitter: 0.022 },
  { city: "Zirakpur", lat: 30.6425, lng: 76.8173, jitter: 0.018 },
  { city: "Kharar", lat: 30.7460, lng: 76.6470, jitter: 0.018 },
];

/*
 * Names from the four states asked for.
 *
 * Surnames carry the regional signal, so they are grouped and the
 * hometown is picked to match — a Dogra surname with a Ludhiana
 * hometown reads as generated, and this data exists to be looked at.
 */
const REGIONS = {
  punjab: {
    female: ["Simran", "Jasleen", "Harleen", "Gurleen", "Navneet", "Amrit", "Kirandeep", "Manpreet", "Sukhmani", "Ravneet", "Prabhleen", "Ishmeet"],
    male: ["Arshdeep", "Gurpreet", "Jaskaran", "Harnoor", "Manav", "Rajveer", "Sukhbir", "Tarandeep"],
    /*
     * Kaur and Singh are gendered, and the rest are not.
     *
     * Pooling them produced "Manav Kaur", which anybody from here reads
     * as fake immediately. Split so the gendered ones only reach the
     * gender they belong to.
     */
    last: ["Sidhu", "Gill", "Sandhu", "Bajwa", "Dhillon", "Randhawa", "Grewal", "Brar", "Sekhon"],
    lastFemale: ["Kaur"],
    lastMale: ["Singh"],
    homes: ["Ludhiana", "Amritsar", "Patiala", "Jalandhar", "Bathinda", "Mohali"],
  },
  himachal: {
    female: ["Ananya", "Shivani", "Kritika", "Nishtha", "Aarushi", "Tanvi", "Muskan", "Riddhima"],
    male: ["Aryan", "Rohit", "Kunal", "Shubham", "Devansh"],
    last: ["Thakur", "Rana", "Chauhan", "Negi", "Sharma", "Verma", "Katoch"],
    homes: ["Shimla", "Solan", "Mandi", "Dharamshala", "Kangra", "Baddi"],
  },
  jammu: {
    female: ["Ridhima", "Sakshi", "Aditi", "Vasudha", "Meghna", "Ishita", "Anjali"],
    male: ["Vikrant", "Sahil", "Abhinav", "Karan"],
    last: ["Gupta", "Jamwal", "Slathia", "Manhas", "Bhat", "Raina", "Dogra"],
    homes: ["Jammu", "Udhampur", "Katra", "Samba", "Kathua"],
  },
  haryana: {
    female: ["Nikita", "Priyanka", "Bhavna", "Sneha", "Divya", "Komal", "Yashika"],
    male: ["Ankit", "Deepak", "Naveen", "Sagar"],
    last: ["Dahiya", "Malik", "Hooda", "Sangwan", "Yadav", "Phogat", "Beniwal"],
    homes: ["Panchkula", "Ambala", "Karnal", "Hisar", "Rohtak", "Gurugram"],
  },
};

const WORK = [
  ["Product designer", "Design"], ["Software engineer", "IT Park, Mohali"],
  ["Dentist", "Sector 34"], ["Architect", "Studio in Sector 9"],
  ["Physiotherapist", "Fortis"], ["Air hostess", "IndiGo"],
  ["CA in practice", "Sector 17"], ["Content writer", "Freelance"],
  ["Fashion merchandiser", "Elante"], ["Assistant professor", "Panjab University"],
  ["Data analyst", "Infosys"], ["Clinical psychologist", "Private practice"],
  ["Bakery owner", "Sector 8"], ["Civil services aspirant", "Preparing for UPSC"],
  ["Nutritionist", "Sector 35"], ["Photographer", "Weddings, mostly"],
  ["HR manager", "Quark City"], ["Kathak dancer", "Teaches on weekends"],
  ["Interior designer", "Panchkula"], ["Radiologist", "PGI"],
];

const EDU = [
  "Panjab University", "PEC Chandigarh", "Thapar, Patiala", "GNDU Amritsar",
  "NIT Hamirpur", "Chitkara University", "Punjabi University", "UIET Chandigarh",
  "Government College for Girls, Sector 11", "Jammu University",
];

/* Written in the register people actually use here. */
const BIOS = [
  "Sector 17 for chaat, Sukhna for everything else.",
  "Will drive to Kasauli on a Saturday with zero planning.",
  "Punjabi at home, chaos everywhere else.",
  "Looking for someone who also thinks Elante food court is underrated.",
  "Weekends are for the hills. Weekdays are for surviving till the weekend.",
  "I make excellent chai and mediocre decisions.",
  "PGI resident. My sleep schedule is a rumour.",
  "Grew up in the hills, now negotiating with Chandigarh traffic.",
  "Rock Garden regular. Yes, still. No, I don't want to hear it.",
  "Amritsar born. I have strong opinions about kulcha.",
  "Half my camera roll is Sukhna at 6am.",
  "Two dogs, one bad guitar, endless playlists.",
  "If you can keep up on a trek, we'll get along.",
  "Ambala girl in Chandigarh. Still can't find good chole bhature.",
  "Reading in cafes is my entire personality. Working on it.",
  "Bhangra at weddings, jazz at home. Both are true.",
  "Manali in winter is non-negotiable.",
  "Sector 35 is my whole world and I'm okay with that.",
  "Ask me about my filter coffee setup. Or don't.",
  "Runs the Sukhna loop, walks everywhere else.",
];

const PROMPT_ANSWERS = {
  "My texting style is best described as": ["Paragraphs or one word. No middle ground.", "Voice notes. Sorry in advance.", "Fast replier, slow decision maker.", "Memes, mostly. Words when necessary."],
  "The way to win me over is": ["Good parathas and better playlists.", "Remember the small thing I mentioned once.", "Be genuinely kind to waiters.", "Plan something without asking me to plan it."],
  "A perfect first date looks like": ["Coffee in Sector 9, then wherever.", "Sukhna at sunset, no phones.", "Street food crawl and honest conversation.", "A long drive with the right playlist."],
  "I get way too excited about": ["Hill station weather forecasts.", "New cafes opening in Sector 26.", "Airport pickups. I love the drive.", "Anyone who cooks for me."],
  "My most controversial opinion is": ["Chandigarh is better than Delhi. Obviously.", "Pineapple belongs on pizza.", "Winter is the only good season here.", "Elante is overrated. Sector 17 forever."],
  "Two truths and a lie": ["Trekked Triund thrice, speak four languages, hate chai.", "Ex-national swimmer, terrible driver, allergic to coriander.", "Lived in three states, can't ride a cycle, bake sourdough."],
  "The last thing that made me laugh": ["My dog losing to a closed door.", "Dad discovering voice notes.", "A very confident wrong answer in a meeting.", "My own parking attempt."],
  "I'm looking for someone who": ["Texts back and shows up.", "Has their own thing going on.", "Laughs at their own jokes first.", "Will do the hill trip without complaining."],
  "You should not go out with me if": ["You hate dogs or spontaneous plans.", "Punctuality means nothing to you.", "You think ambition is a red flag.", "You don't like the mountains."],
  "My simple pleasures are": ["Chai at 4, always.", "Empty roads and old songs.", "First rain, hot pakoras.", "A book, a balcony, no plans."],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
const intBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const OPTIONS = {};      // filled from profile_field_options
let PROMPT_QS = [];

/* Where a photo actually comes from. randomuser.me serves consistent
 * portraits by index, which keeps a person's three photos plausibly
 * the same person rather than three strangers. */
async function fetchPortrait(gender, index) {
  const bucket = gender === "female" ? "women" : "men";
  const url = `https://randomuser.me/api/portraits/${bucket}/${index}.jpg`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`portrait ${index}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function uploadPhotos(userId, gender, portraitIds) {
  const urls = [];

  for (let i = 0; i < portraitIds.length; i++) {
    const body = await fetchPortrait(gender, portraitIds[i]);
    const path = `${userId}/seed-${i}.jpg`;

    const { error } = await db.storage
      .from("photos")
      .upload(path, body, { contentType: "image/jpeg", upsert: true });

    if (error) throw new Error(`upload: ${error.message}`);

    urls.push(db.storage.from("photos").getPublicUrl(path).data.publicUrl);
  }

  return urls;
}

function buildProfile(regionKey, gender, area, portraitBase, takenNames) {
  const region = REGIONS[regionKey];

  const surnames = [
    ...region.last,
    ...(gender === "female" ? (region.lastFemale ?? []) : (region.lastMale ?? [])),
  ];

  /*
   * Names are unique across the batch.
   *
   * Two "Ishita Bhat" in one deck reads as a bug in the app rather than
   * a coincidence, which is exactly the wrong thing for demo data to
   * suggest. Give up after enough tries rather than loop forever on a
   * small name pool.
   */
  let first;
  let last;

  for (let attempt = 0; attempt < 40; attempt++) {
    first = pick(region[gender]);
    last = pick(surnames);
    if (!takenNames.has(`${first} ${last}`)) break;
  }

  takenNames.add(`${first} ${last}`);

  const age = intBetween(21, 32);
  const [work, education] = pick(WORK);

  const answered = pickN(PROMPT_QS, 3).map((question) => ({
    question,
    answer: pick(PROMPT_ANSWERS[question] ?? ["Ask me."]),
  }));

  // Born on a plausible day, and age kept consistent with it — the app
  // shows age, and a mismatch is the sort of thing that gets noticed.
  const birthYear = new Date().getFullYear() - age;
  const dob = `${birthYear}-${String(intBetween(1, 12)).padStart(2, "0")}-${String(
    intBetween(1, 28),
  ).padStart(2, "0")}`;

  return {
    name: `${first} ${last}`,
    preferred_name: first,
    age,
    date_of_birth: dob,
    gender,
    interested_in: gender === "female" ? "male" : "female",
    bio: pick(BIOS),
    city: area.city,
    hometown: pick(region.homes),
    work,
    education,
    latitude: Number((area.lat + (Math.random() - 0.5) * area.jitter).toFixed(6)),
    longitude: Number((area.lng + (Math.random() - 0.5) * area.jitter).toFixed(6)),
    height_cm: gender === "female" ? intBetween(152, 173) : intBetween(168, 188),
    languages: pickN(["Punjabi", "Hindi", "English", "Urdu"], intBetween(2, 3)),
    interests: pickN(OPTIONS.interests, intBetween(5, 8)),
    qualities: pickN(OPTIONS.qualities, 3),
    causes: pickN(OPTIONS.causes, intBetween(1, 3)),
    prompts: answered,
    pronouns: gender === "female" ? ["she/her"] : ["he/him"],
    exercise: pick(OPTIONS.exercise),
    drinking: pick(OPTIONS.drinking),
    smoking: pick(["No, I don't smoke", "No, I don't smoke", "Sometimes", "Trying to quit"]),
    looking_for: pick(OPTIONS.looking_for),
    kids: pick(OPTIONS.kids),
    have_kids: "Don't have kids",
    education_level: pick(OPTIONS.education_level),
    star_sign: pick(OPTIONS.star_sign),
    religion: pick(regionKey === "punjab" ? ["Sikh", "Sikh", "Hindu"] : ["Hindu", "Hindu", "Sikh", "Spiritual"]),
    politics: pick(OPTIONS.politics),
    orientation: "Straight",
    min_age: 21,
    max_age: 36,
    search_radius: intBetween(15, 50),
    onboarding_done: true,
    published_at: new Date().toISOString(),
    // Recent, so they clear the 60-day dormancy cut in the pool query.
    last_active: new Date(Date.now() - intBetween(0, 72) * 3600_000).toISOString(),
    is_online: Math.random() < 0.25,
    plan: "free",
    plan_key: "free",
    // The marker. This is what makes these removable later.
    draft: { seed: true, seeded_at: new Date().toISOString() },
    portraitBase,
  };
}

async function main() {
  /*
   * How many of each.
   *
   *   node scripts/seed-tricity.js 100/100   → 100 women, 100 men
   *   node scripts/seed-tricity.js 40        → 20 and 20
   *
   * Both halves matter: a deck is built from people looking for each
   * other, so seeding only women leaves every woman's deck empty.
   */
  const arg = String(process.argv[2] ?? "24");
  const [women, men] = arg.includes("/")
    ? arg.split("/").map((part) => Math.max(0, Number(part) || 0))
    : [Math.floor(Number(arg) / 2), Math.ceil(Number(arg) / 2)];

  const { data: options } = await db
    .from("profile_field_options")
    .select("field_key,value")
    .eq("active", true);

  for (const row of options) (OPTIONS[row.field_key] ??= []).push(row.value);

  const { data: prompts } = await db
    .from("profile_prompts")
    .select("question")
    .eq("active", true);

  PROMPT_QS = prompts.map((p) => p.question);

  console.log(`Seeding ${women} women and ${men} men across the tricity.\n`);

  const regionKeys = Object.keys(REGIONS);
  const made = [];

  /*
   * Portrait indices, shuffled and drawn without replacement.
   *
   * Each seeded person takes three consecutive portraits so their photos
   * are plausibly the same face. Drawing from a shuffled pool means no
   * two people share a starting index, and running out is a clean stop
   * rather than an infinite search for a free one.
   *
   * randomuser.me serves 0-99 per gender, so a hundred each is the
   * ceiling exactly.
   */
  const shuffled = () =>
    Array.from({ length: 100 }, (_, index) => index).sort(() => Math.random() - 0.5);

  const womenPortraits = shuffled();
  const menPortraits = shuffled();

  // Seeded names already in the database, so a second run does not
  // collide with the first.
  const { data: existing } = await db
    .from("profiles")
    .select("name")
    .like("email", "%@tickle.seed");

  const takenNames = new Set((existing ?? []).map((row) => row.name));

  /*
   * An exact split rather than a coin flip.
   *
   * This used to roll 80% women, because the one account testing it was
   * a man. That is the wrong shape for a real deck — a man swiping sees
   * only women and a woman sees almost nobody. Both halves are seeded
   * explicitly so either kind of account has a full deck.
   *
   * Passed as "100/100" or a single number, which splits evenly.
   */
  const plan = [
    ...new Array(women).fill("female"),
    ...new Array(men).fill("male"),
  ];

  for (let i = 0; i < plan.length; i++) {
    const gender = plan[i];
    const regionKey = regionKeys[i % regionKeys.length];
    const area = AREAS[i % AREAS.length];

    /*
     * randomuser.me serves portraits 0-99 per gender, so a hundred of
     * each is exactly the ceiling. Beyond that the old do/while would
     * have spun forever looking for an unused index — a seeding script
     * that hangs rather than saying what is wrong.
     */
    const pool = gender === "female" ? womenPortraits : menPortraits;

    if (pool.length === 0) {
      console.log(`  ${i + 1}. out of ${gender} portraits, stopping`);
      break;
    }

    const base = pool.pop();

    const profile = buildProfile(regionKey, gender, area, base, takenNames);
    const { portraitBase, ...fields } = profile;

    const email = `seed.${Date.now()}.${i}@tickle.seed`;

    const { data: created, error: authError } = await db.auth.admin.createUser({
      email,
      password: `Seed!${Math.random().toString(36).slice(2)}A9`,
      email_confirm: true,
      user_metadata: { seed: true },
    });

    if (authError) {
      console.log(`  ${i + 1}. auth failed: ${authError.message}`);
      continue;
    }

    const userId = created.user.id;

    try {
      const photos = await uploadPhotos(userId, gender, [
        portraitBase,
        (portraitBase + 1) % 91,
        (portraitBase + 2) % 91,
      ]);

      const { error } = await db
        .from("profiles")
        .update({ ...fields, email, photos })
        .eq("user_id", userId);

      if (error) throw new Error(error.message);

      made.push({ name: fields.name, city: fields.city, age: fields.age, gender });
      console.log(
        `  ${String(i + 1).padStart(2)}. ${fields.name.padEnd(20)} ${String(fields.age).padStart(2)}  ${fields.city.padEnd(12)} ${photos.length} photos`,
      );
    } catch (error) {
      // A half-made profile is worse than none: it would sit in the
      // deck with no photos. Roll the auth user back instead.
      await db.auth.admin.deleteUser(userId);
      console.log(`  ${i + 1}. failed, rolled back: ${error.message}`);
    }
  }

  console.log(`\nDone. ${made.length} profiles created.`);
  console.log(
    `Women: ${made.filter((m) => m.gender === "female").length}  Men: ${made.filter((m) => m.gender === "male").length}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
