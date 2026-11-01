import { type QualityTier, cleanCanonicalTrackTitle, deduplicateTrackCollection, getPhoneticSongKey } from "./quality";
import type { TrendingTrackItem } from "./trendingApi";
import {
  preloadCoverImage,
  rememberStickyCover,
} from "./arabicTrendingCatalog";
import {
  extractCleanYouTubeId,
  searchYouTube,
} from "./youtubeApi";

export interface LanguageArtistSeed {
  name: string;
  aliases?: readonly string[];
  basePopularity: number;
}

export interface LanguageCatalogConfig {
  langId: string;
  label: string;
  jioLanguages: readonly string[];
  itunesCountry: string;
  artists: readonly LanguageArtistSeed[];
}

function buildArtistList(names: readonly (string | [string, ...string[]])[]): LanguageArtistSeed[] {
  return names.map((entry, idx) => {
    const basePopularity = 995 - idx * 3;
    if (typeof entry === "string") {
      return { name: entry, basePopularity };
    }
    return {
      name: entry[0],
      aliases: entry.slice(1),
      basePopularity,
    };
  });
}

export const MULTI_LANG_TOP_40_ARTISTS: Record<string, LanguageCatalogConfig> = {
  english: {
    langId: "english",
    label: "English",
    jioLanguages: ["english"],
    itunesCountry: "us",
    artists: buildArtistList([
      "The Weeknd",
      "Taylor Swift",
      "Bruno Mars",
      "Ed Sheeran",
      "Billie Eilish",
      "Post Malone",
      "Drake",
      "Eminem",
      "Rihanna",
      "Adele",
      "Coldplay",
      "Imagine Dragons",
      "Dua Lipa",
      "Ariana Grande",
      "Justin Bieber",
      "Travis Scott",
      "Kendrick Lamar",
      "Lady Gaga",
      ["Beyoncé", "Beyonce"],
      "Katy Perry",
      "Shawn Mendes",
      "Charlie Puth",
      "Sam Smith",
      "Sia",
      "Lana Del Rey",
      "Harry Styles",
      "Sabrina Carpenter",
      "Olivia Rodrigo",
      "SZA",
      "Doja Cat",
      "Linkin Park",
      "Maroon 5",
      "OneRepublic",
      "Calvin Harris",
      "Alan Walker",
      "Marshmello",
      "The Chainsmokers",
      "Selena Gomez",
      "Miley Cyrus",
      "Michael Jackson",
    ]),
  },
  malayalam: {
    langId: "malayalam",
    label: "Malayalam",
    jioLanguages: ["malayalam"],
    itunesCountry: "in",
    artists: buildArtistList([
      ["K. J. Yesudas", "KJ Yesudas", "Yesudas"],
      ["K. S. Chithra", "KS Chithra", "Chithra"],
      ["M. G. Sreekumar", "MG Sreekumar"],
      "Vineeth Sreenivasan",
      "Sushin Shyam",
      "Shaan Rahman",
      "Jakes Bejoy",
      "Dabzee",
      "Sid Sriram",
      ["K. S. Harisankar", "KS Harisankar", "Harisankar"],
      "Sithara Krishnakumar",
      "Vidhu Prathap",
      "Sujatha Mohan",
      ["P. Jayachandran", "Jayachandran"],
      ["G. Venugopal", "Venugopal"],
      "Vijay Yesudas",
      "Najim Arshad",
      "Haricharan",
      "Rex Vijayan",
      "Govind Vasantha",
      "Gopi Sundar",
      "Deepak Dev",
      "Hesham Abdul Wahab",
      "Rahul Raj",
      "Bijibal",
      "Shahabaz Aman",
      "Pradeep Kumar",
      "Sooraj Santhosh",
      "Job Kurian",
      "Sachin Warrier",
      "Fejo",
      "Vedan",
      "Kapil Kapilan",
      "Shweta Mohan",
      ["Jyotsna Radhakrishnan", "Jyotsna"],
      "Rimi Tomy",
      "Madhu Balakrishnan",
      "Unni Menon",
      "Anne Amie",
      "Anwar Sadath",
    ]),
  },
  tamil: {
    langId: "tamil",
    label: "Tamil",
    jioLanguages: ["tamil"],
    itunesCountry: "in",
    artists: buildArtistList([
      "Anirudh Ravichander",
      ["A. R. Rahman", "AR Rahman", "A.R. Rahman"],
      ["Ilaiyaraaja", "Ilayaraja"],
      ["S. P. Balasubrahmanyam", "SP Balasubrahmanyam", "S.P.B."],
      "Sid Sriram",
      "Yuvan Shankar Raja",
      "Harris Jayaraj",
      ["G. V. Prakash Kumar", "GV Prakash Kumar", "G.V. Prakash"],
      "Santhosh Narayanan",
      ["K. S. Chithra", "KS Chithra", "Chithra"],
      ["S. Janaki", "S Janaki"],
      "Hariharan",
      "Shankar Mahadevan",
      "Karthik",
      "Haricharan",
      "Pradeep Kumar",
      ["Chinmayi Sripada", "Chinmayi"],
      "Shreya Ghoshal",
      "Dhanush",
      ["P. Unnikrishnan", "Unnikrishnan"],
      ["K. J. Yesudas", "KJ Yesudas", "Yesudas"],
      ["T. M. Soundararajan", "TM Soundararajan"],
      "Malaysia Vasudevan",
      "Mano",
      "Srinivas",
      "Naresh Iyer",
      "Vijay Prakash",
      "Benny Dayal",
      "Sean Roldan",
      "Hiphop Tamizha",
      "Vijay Antony",
      ["D. Imman", "D Imman"],
      ["Sam C. S.", "Sam CS"],
      "Devi Sri Prasad",
      ["Thaman S", "S. Thaman"],
      "Jonita Gandhi",
      "Dhee",
      "Andrea Jeremiah",
      "Saindhavi",
      "Shakthisree Gopalan",
    ]),
  },
  hindi: {
    langId: "hindi",
    label: "Hindi",
    jioLanguages: ["hindi"],
    itunesCountry: "in",
    artists: buildArtistList([
      "Arijit Singh",
      "Shreya Ghoshal",
      "Pritam",
      ["A. R. Rahman", "AR Rahman", "A.R. Rahman"],
      "Sonu Nigam",
      ["KK", "K.K.", "Krishnakumar Kunnath"],
      "Kishore Kumar",
      "Lata Mangeshkar",
      "Mohammed Rafi",
      "Asha Bhosle",
      "Udit Narayan",
      "Kumar Sanu",
      "Alka Yagnik",
      "Atif Aslam",
      "Rahat Fateh Ali Khan",
      "Jubin Nautiyal",
      "Vishal Mishra",
      "B Praak",
      "Diljit Dosanjh",
      "Mohit Chauhan",
      "Sunidhi Chauhan",
      "Shaan",
      "Shankar Mahadevan",
      "Javed Ali",
      "Amit Trivedi",
      "Mithoon",
      ["Vishal-Shekhar", "Vishal Dadlani", "Shekhar Ravjiani"],
      ["Sachin-Jigar", "Sachin Jigar"],
      "Darshan Raval",
      "Armaan Malik",
      "Badshah",
      ["Yo Yo Honey Singh", "Honey Singh"],
      "Neha Kakkar",
      "Jasleen Royal",
      "Shilpa Rao",
      "Asees Kaur",
      "Himesh Reshammiya",
      "Lucky Ali",
      "Kailash Kher",
      "Sukhwinder Singh",
    ]),
  },
  urdu: {
    langId: "urdu",
    label: "Urdu",
    jioLanguages: ["urdu", "hindi", "punjabi"],
    itunesCountry: "pk",
    artists: buildArtistList([
      "Nusrat Fateh Ali Khan",
      "Atif Aslam",
      "Rahat Fateh Ali Khan",
      "Abida Parveen",
      "Mehdi Hassan",
      "Ghulam Ali",
      "Ali Zafar",
      "Shafqat Amanat Ali",
      "Sajjad Ali",
      "Strings",
      "Vital Signs",
      "Junoon",
      "Junaid Jamshed",
      "Talha Anjum",
      "Young Stunners",
      "Talhah Yunus",
      "Kaifi Khalil",
      "Abdul Hannan",
      "Hasan Raheem",
      "Asim Azhar",
      "Bilal Saeed",
      "Farhan Saeed",
      "Mustafa Zahid",
      "Falak Shabir",
      "Momina Mustehsan",
      ["Quratulain Balouch", "QB"],
      "Aima Baig",
      "Shae Gill",
      "Ali Sethi",
      "Sahir Ali Bagga",
      "Hadiqa Kiani",
      "Zeb Bangash",
      ["Abrar-ul-Haq", "Abrar Ul Haq"],
      "Naseebo Lal",
      "Umair Jaswal",
      "Uzair Jaswal",
      "Bayaan",
      "Kaavish",
      "Farida Khanum",
      "Iqbal Bano",
    ]),
  },
  telugu: {
    langId: "telugu",
    label: "Telugu",
    jioLanguages: ["telugu"],
    itunesCountry: "in",
    artists: buildArtistList([
      ["S. P. Balasubrahmanyam", "SP Balasubrahmanyam"],
      "Sid Sriram",
      "Devi Sri Prasad",
      ["Thaman S", "S. Thaman"],
      ["M. M. Keeravani", "MM Keeravani"],
      "Mani Sharma",
      "Anurag Kulkarni",
      "Ram Miriyala",
      "Mangli",
      ["K. S. Chithra", "KS Chithra", "Chithra"],
      ["S. Janaki", "S Janaki"],
      ["P. Susheela", "P Susheela"],
      "Ghantasala",
      "Shreya Ghoshal",
      ["Sunitha Upadrasta", "Sunitha"],
      "Geetha Madhuri",
      ["Chinmayi Sripada", "Chinmayi"],
      "Karthik",
      "Haricharan",
      "Hemachandra",
      ["L. V. Revanth", "LV Revanth", "Revanth"],
      "Rahul Sipligunj",
      "Armaan Malik",
      "Shankar Mahadevan",
      "Mano",
      "Rajesh Krishnan",
      "Tippu",
      ["Mickey J. Meyer", "Mickey J Meyer"],
      "Vivek Sagar",
      "Hesham Abdul Wahab",
      "Kaala Bhairava",
      "Sri Krishna",
      "Roll Rida",
      "Chakri",
      "Kousalya",
      "Usha",
      "Dinker Kalvala",
      "Damini Bhatla",
      "Mounima",
      "Lipsika",
    ]),
  },
  kannada: {
    langId: "kannada",
    label: "Kannada",
    jioLanguages: ["kannada"],
    itunesCountry: "in",
    artists: buildArtistList([
      ["Dr. Rajkumar", "Rajkumar"],
      ["S. P. Balasubrahmanyam", "SP Balasubrahmanyam"],
      "Sonu Nigam",
      "Vijay Prakash",
      "Rajesh Krishnan",
      "Arjun Janya",
      ["B. Ajaneesh Loknath", "Ajaneesh Loknath"],
      "Charan Raj",
      "Sanjith Hegde",
      "Raghu Dixit",
      "Armaan Malik",
      "Anuradha Bhat",
      ["K. S. Chithra", "KS Chithra", "Chithra"],
      ["S. Janaki", "S Janaki"],
      "Vani Jairam",
      ["P. B. Sreenivas", "PB Sreenivas"],
      ["C. Ashwath", "C Ashwath"],
      "Hamsalekha",
      "Mano Murthy",
      "Gurukiran",
      ["V. Harikrishna", "V Harikrishna"],
      "Ravi Basrur",
      "Chandan Shetty",
      "Vasuki Vaibhav",
      "All Ok",
      "Nakul Abhyankar",
      "Siddhartha Belmannu",
      "Aishwarya Rangarajan",
      "Indu Nagaraj",
      "Shamitha Malnad",
      "Archana Udupa",
      "Nanditha",
      "Supriya Lohith",
      "Tippu",
      "Hemanth Kumar",
      "Chethan Naik",
      "Kunal Ganjawala",
      "Shreya Ghoshal",
      "Shankar Mahadevan",
      "Naveen Sajju",
    ]),
  },
  punjabi: {
    langId: "punjabi",
    label: "Punjabi",
    jioLanguages: ["punjabi"],
    itunesCountry: "in",
    artists: buildArtistList([
      "Diljit Dosanjh",
      "Karan Aujla",
      "AP Dhillon",
      "Sidhu Moose Wala",
      "Shubh",
      "Gurinder Gill",
      "Amrinder Gill",
      "Satinder Sartaaj",
      "Gurdas Maan",
      "Babbu Maan",
      "Arjan Dhillon",
      "Talwiinder",
      "Harnoor",
      "The PropheC",
      "Guru Randhawa",
      "Harrdy Sandhu",
      "Ammy Virk",
      "Jassie Gill",
      "B Praak",
      "Jaani",
      "Sharry Mann",
      "Gippy Grewal",
      "Kulwinder Billa",
      "Ranjit Bawa",
      "Tarsem Jassar",
      "Nimrat Khaira",
      "Sunanda Sharma",
      "Kaur B",
      "Jasmine Sandlas",
      "Nooran Sisters",
      "Prem Dhillon",
      "Navaan Sandhu",
      "Sukha",
      "Tegi Pannu",
      "Raf Saperra",
      "Jazzy B",
      "Imran Khan",
      "Bohemia",
      "Mankirt Aulakh",
      "Parmish Verma",
    ]),
  },
  spanish: {
    langId: "spanish",
    label: "Spanish",
    jioLanguages: ["spanish"],
    itunesCountry: "es",
    artists: buildArtistList([
      "Bad Bunny",
      "Karol G",
      "Shakira",
      ["Rosalía", "Rosalia"],
      "Feid",
      "Rauw Alejandro",
      "Peso Pluma",
      "J Balvin",
      "Daddy Yankee",
      "Ozuna",
      "Maluma",
      "Enrique Iglesias",
      "Romeo Santos",
      "Marc Anthony",
      "Luis Fonsi",
      "Quevedo",
      "Myke Towers",
      "Bizarrap",
      "Anuel AA",
      "Farruko",
      "Nicky Jam",
      "Sebastián Yatra",
      "Camilo",
      "Manuel Turizo",
      "Morat",
      "Aitana",
      "C. Tangana",
      "Kali Uchis",
      "Becky G",
      "Natti Natasha",
      "Rosario",
      "Alejandro Sanz",
      "Pablo Alborán",
      "David Bisbal",
      "Ricky Martin",
      "Chayanne",
      "Juanes",
      "Carlos Vives",
      "Maná",
      "Christian Nodal",
    ]),
  },
  french: {
    langId: "french",
    label: "French",
    jioLanguages: ["french"],
    itunesCountry: "fr",
    artists: buildArtistList([
      "Stromae",
      "Indila",
      "Aya Nakamura",
      "Gims",
      "Daft Punk",
      "DJ Snake",
      "David Guetta",
      "Dadju",
      "Ninho",
      "Jul",
      ["Angèle", "Angele"],
      "Pomme",
      "Kendji Girac",
      "Soprano",
      "Slimane",
      "Vitaa",
      "Orelsan",
      "Nekfeu",
      "PNL",
      "Booba",
      "Damso",
      "Lomepal",
      "Clara Luciani",
      "Zaho de Sagazan",
      "Zaz",
      ["Céline Dion", "Celine Dion"],
      ["Édith Piaf", "Edith Piaf"],
      "Charles Aznavour",
      "Jacques Brel",
      "Serge Gainsbourg",
      "Mylène Farmer",
      "Francis Cabrel",
      "Jean-Jacques Goldman",
      "Johnny Hallyday",
      "M. Pokora",
      "Amir",
      "Louane",
      "Tayc",
      "Tiakola",
      "SDM",
    ]),
  },
  bengali: {
    langId: "bengali",
    label: "Bengali",
    jioLanguages: ["bengali"],
    itunesCountry: "in",
    artists: buildArtistList([
      "Arijit Singh",
      "Shreya Ghoshal",
      "Anupam Roy",
      "Jeet Gannguli",
      "Rupam Islam",
      "Fossils",
      "Anjan Dutt",
      "Nachiketa Chakraborty",
      "Kishore Kumar",
      "Hemanta Mukherjee",
      "Manna Dey",
      "Sandhya Mukherjee",
      "Lata Mangeshkar",
      "Asha Bhosle",
      "Kumar Sanu",
      "Babul Supriyo",
      "Shaan",
      "Sonu Nigam",
      "arnob",
      ["Shayan Chowdhury Arnob", "Arnob"],
      "Ishan Mitra",
      "Mahtim Shakib",
      "Somlata Acharyya Chowdhury",
      "Lagnajita Chakraborty",
      "Iman Chakraborty",
      "Anindya Chatterjee",
      "Chandrabindoo",
      "Cactus",
      "Bhoomi",
      "Lakkhichhara",
      "Debajyoti Mishra",
      "Debojyoti Mishra",
      "Indraadip Dasgupta",
      "antara Mitra",
      "Monali Thakur",
      "june Banerjee",
      "Rupankar Bagchi",
      "Srikanto Acharya",
      "Lopamudra Mitra",
      "Kabir Suman",
    ]),
  },
};

const JIOSAAVN_API_BASE = "https://elitejiosaavn-api.vercel.app/api";
const MULTI_LANG_CACHE_PREFIX = "void-multilang-deep-v8:";

const UNWANTED_TRACK_REGEX =
  /\b(karaoke|instrumental|tribute|in the style of|originally performed by|made famous by|backing track|minus one|without vocals|no vocals|ringtone|8d|16d|slowed|reverb|sped up|nightcore|cover|lofi|lo-fi|mashup|dj\s*mix|piano version|guitar version|violin version|shorts|whatsapp status|ameritz|done again|sunfly|karafun|sing king|party tyme|hit crew|countdown)\b/i;

function decodeHtml(input: string): string {
  return String(input || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function normTokenString(input: string): string {
  return getPhoneticSongKey(cleanCanonicalTrackTitle(String(input || "")));
}

function doesArtistMatchCandidate(artistNames: string[], seed: LanguageArtistSeed): boolean {
  const candidates = artistNames.map(normTokenString).filter(Boolean);
  if (candidates.length === 0) return false;

  const validTargets = [seed.name, ...(seed.aliases || [])]
    .map(normTokenString)
    .filter(Boolean);

  for (const target of validTargets) {
    const targetWords = target.split(" ").filter((w) => w.length >= 2);
    for (const cand of candidates) {
      if (cand === target) return true;
      const candWords = cand.split(" ").filter((w) => w.length >= 2);
      if (targetWords.length >= 2 && targetWords.every((tw) => candWords.includes(tw))) {
        return true;
      }
      if (targetWords.length === 1 && targetWords[0].length >= 3 && candWords.includes(targetWords[0])) {
        return true;
      }
    }
  }
  return false;
}

function extractJioArtistNames(song: any): string[] {
  const names: string[] = [];
  if (Array.isArray(song?.artists?.primary)) {
    for (const a of song.artists.primary) {
      if (a?.name) names.push(decodeHtml(String(a.name)));
    }
  }
  if (Array.isArray(song?.artists?.all)) {
    for (const a of song.artists.all) {
      if (a?.name) names.push(decodeHtml(String(a.name)));
    }
  }
  if (typeof song?.primaryArtists === "string") {
    for (const part of song.primaryArtists.split(",")) {
      if (part.trim()) names.push(decodeHtml(part.trim()));
    }
  }
  return names;
}

async function fetchJioRawSongs(query: string, limit = 30): Promise<any[]> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 5500);
  try {
    const res = await fetch(
      `${JIOSAAVN_API_BASE}/search/songs?query=${encodeURIComponent(query)}&page=1&limit=${limit}`,
      { signal: ctrl.signal }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data?.results)
      ? json.data.results
      : Array.isArray(json?.results)
        ? json.results
        : [];
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

function extractBestJioStream(song: any): {
  url: string;
  bitrate: number;
  fallbackUrls: string[];
} | null {
  if (!Array.isArray(song?.downloadUrl)) return null;
  const variants = song.downloadUrl
    .map((d: any) => ({
      url: String(d?.url || d?.link || "").trim(),
      kbps: Number.parseInt(String(d?.quality || "").replace(/\D+/g, ""), 10) || 0,
    }))
    .filter((d: { url: string; kbps: number }) => d.url.startsWith("http"));
  if (variants.length === 0) return null;
  variants.sort((a: { kbps: number }, b: { kbps: number }) => b.kbps - a.kbps);
  return {
    url: variants[0].url,
    bitrate: variants[0].kbps || 320,
    fallbackUrls: variants.slice(1).map((v: { url: string }) => v.url),
  };
}

function extractBestJioCover(song: any): string {
  if (!Array.isArray(song?.image)) return "";
  const imgs = song.image
    .map((i: any) => ({ q: i?.quality, url: String(i?.url || i?.link || "").trim() }))
    .filter((i: { url: string }) => i.url.startsWith("http"));
  return (
    imgs.find((i: { q?: string }) => i.q === "500x500")?.url ||
    imgs[imgs.length - 1]?.url ||
    ""
  );
}

interface ItunesCandidate {
  trackName: string;
  collectionName: string;
  artworkUrl600: string;
  durationSec: number;
  year: number;
}

async function fetchArtistItunesSongs(
  seed: LanguageArtistSeed,
  country: string
): Promise<ItunesCandidate[]> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(
      `/__void_api/itunes-search?term=${encodeURIComponent(
        seed.name
      )}&country=${country}&entity=song&limit=25`,
      { signal: ctrl.signal }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const rows: any[] = Array.isArray(json?.results) ? json.results : [];
    const out: ItunesCandidate[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const artistName = String(row?.artistName || "").trim();
      const trackName = String(row?.trackName || "").trim();
      const collectionName = String(row?.collectionName || seed.name).trim();
      if (!trackName || !artistName) continue;
      if (!doesArtistMatchCandidate([artistName], seed)) continue;
      if (UNWANTED_TRACK_REGEX.test(`${trackName} ${collectionName}`)) continue;

      const cleanTitle = cleanCanonicalTrackTitle(trackName.replace(/\s*\((?:feat|ft)\.[^)]*\)/gi, "").trim());
      const key = normTokenString(cleanTitle);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const art600 = String(row?.artworkUrl100 || "")
        .replace("100x100bb", "600x600bb")
        .trim();
      const durationSec = Math.round((Number(row?.trackTimeMillis) || 0) / 1000) || 230;
      if (durationSec < 85 || durationSec > 900) continue;
      const year = row?.releaseDate ? new Date(row.releaseDate).getFullYear() || 2024 : 2024;

      out.push({
        trackName: cleanTitle,
        collectionName,
        artworkUrl600: art600.startsWith("http") ? art600 : "",
        durationSec,
        year,
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

async function deepSearch5SongsForLanguageArtist(
  config: LanguageCatalogConfig,
  seed: LanguageArtistSeed,
  artistIdx: number
): Promise<Omit<TrendingTrackItem, "trendingRank">[]> {
  const allowedLangs = new Set(config.jioLanguages.map((l) => l.toLowerCase()));
  const isRegionalIndianOrGlobal = config.langId !== "english";

  // 1. Query JioSaavn first, and only query the cached iTunes/Deezer proxy when needed
  const [jioLangRes, jioDirectRes] = await Promise.all([
    isRegionalIndianOrGlobal
      ? fetchJioRawSongs(`${seed.name} ${config.label}`, 35)
      : fetchJioRawSongs(seed.name, 35),
    isRegionalIndianOrGlobal ? fetchJioRawSongs(seed.name, 25) : Promise.resolve([]),
  ]);

  const needsItunesFallback =
    !isRegionalIndianOrGlobal ||
    config.langId === "spanish" ||
    config.langId === "french" ||
    jioLangRes.length + jioDirectRes.length < 5;

  const itunesSongs = needsItunesFallback
    ? await fetchArtistItunesSongs(seed, config.itunesCountry)
    : [];

  const defaultArtistCover =
    itunesSongs.find((s) => s.artworkUrl600)?.artworkUrl600 || "";

  const allJioRaw = [...jioLangRes, ...jioDirectRes];
  // Sort by playCount descending so the artist's 5 most famous songs come first!
  allJioRaw.sort((a, b) => (Number(b?.playCount) || 0) - (Number(a?.playCount) || 0));

  const seenJioIds = new Set<string>();
  const usedSongKeys = new Set<string>();
  const selectedTracks: Omit<TrendingTrackItem, "trendingRank">[] = [];
  const rankBonuses = [48, 42, 36, 30, 24];

  for (const song of allJioRaw) {
    if (selectedTracks.length >= 5) break;
    const rawId = String(song?.id || "").trim();
    if (!rawId || seenJioIds.has(rawId)) continue;
    seenJioIds.add(rawId);

    const songLang = String(song?.language || "").toLowerCase().trim();
    if (!allowedLangs.has(songLang)) continue;

    const name = cleanCanonicalTrackTitle(
      decodeHtml(String(song?.name || song?.title || "")).replace(
        /\s*\((?:feat|ft)\.[^)]*\)/gi,
        ""
      )
    );
    const album = cleanCanonicalTrackTitle(decodeHtml(String(song?.album?.name || "")));
    const label = decodeHtml(String(song?.label || ""));
    const subtitle = decodeHtml(String(song?.subtitle || ""));
    const combinedMeta = `${name} ${album} ${label} ${subtitle}`;

    if (!name || UNWANTED_TRACK_REGEX.test(combinedMeta)) continue;

    const candidateArtists = extractJioArtistNames(song);
    if (!doesArtistMatchCandidate(candidateArtists, seed)) continue;

    const duration = Number(song?.duration) || 0;
    if (duration < 90 || duration > 900) continue;

    const stream = extractBestJioStream(song);
    if (!stream || !stream.url) continue;

    const normKey = normTokenString(name);
    if (!normKey || usedSongKeys.has(normKey)) continue;
    usedSongKeys.add(normKey);

    const matchedItunes = itunesSongs.find((it) => {
      const itKey = normTokenString(it.trackName);
      return itKey && (itKey === normKey || itKey.includes(normKey) || normKey.includes(itKey));
    });

    const coverUrl =
      matchedItunes?.artworkUrl600 || extractBestJioCover(song) || defaultArtistCover;

    const slotIdx = selectedTracks.length;
    const trackId = `api-${config.langId}-${artistIdx + 1}-${slotIdx + 1}`;
    const score = seed.basePopularity + (rankBonuses[slotIdx] || 20);

    if (coverUrl) {
      rememberStickyCover({ id: trackId, title: name, artist: seed.name }, coverUrl);
      preloadCoverImage(coverUrl);
    }

    selectedTracks.push({
      id: trackId,
      title: name,
      name,
      artist: seed.name,
      album: album || matchedItunes?.collectionName || seed.name,
      fileName: `${name}.m4a`,
      fileSize: 0,
      importedAt: 1700000000000 + score,
      audioUrl: stream.url,
      downloadUrl: stream.url,
      src: stream.url,
      image: coverUrl,
      duration,
      source: "JioSaavn",
      qualityBadge: "Very High (320kbps)" as QualityTier,
      bitrate: 320,
      codec: "AAC",
      mimeType: "audio/mp4",
      format: "MP4 (320kbps)",
      qualityVerified: true,
      fallbackUrls: stream.fallbackUrls,
      playCount: Number(song?.playCount) || undefined,
      year: Number(song?.year) || matchedItunes?.year || 2024,
      trendingScore: score,
    });
  }

  // 2. Fast Parallel Fallback if JioSaavn has fewer than 5 verified songs for this artist
  if (selectedTracks.length < 5) {
    const remainingItunes = itunesSongs
      .filter((it) => {
        const k = normTokenString(it.trackName);
        return k && !usedSongKeys.has(k);
      })
      .slice(0, 5 - selectedTracks.length);

    if (remainingItunes.length > 0) {
      const ytSettled = await Promise.allSettled(
        remainingItunes.map(async (itSong) => {
          const ytResults = await searchYouTube(
            `${itSong.trackName} ${seed.name} ${config.label}`
          );
          const validYt = ytResults.find((yt) => {
            const ytId = extractCleanYouTubeId(yt.id || yt.downloadUrl);
            if (!/^[\w-]{11}$/.test(ytId)) return false;
            const meta = `${yt.name || ""} ${yt.artist || ""}`;
            if (UNWANTED_TRACK_REGEX.test(meta)) return false;
            if (yt.duration > 0 && (yt.duration < 85 || yt.duration > 900)) return false;
            return true;
          });
          return { itSong, validYt };
        })
      );

      for (const entry of ytSettled) {
        if (selectedTracks.length >= 5) break;
        if (entry.status !== "fulfilled") continue;
        const { itSong, validYt } = entry.value;
        const slotIdx = selectedTracks.length;
        const trackId = `api-${config.langId}-${artistIdx + 1}-${slotIdx + 1}`;
        const score = seed.basePopularity + (rankBonuses[slotIdx] || 20);
        const coverUrl = itSong.artworkUrl600 || defaultArtistCover || validYt?.image || "";

        if (validYt) {
          const ytId = extractCleanYouTubeId(validYt.id || validYt.downloadUrl);
          if (usedSongKeys.has(ytId)) continue;
          usedSongKeys.add(normTokenString(itSong.trackName));
          usedSongKeys.add(ytId);
          const streamUrl = validYt.downloadUrl || `yt-stream://${ytId}`;

          if (coverUrl) {
            rememberStickyCover(
              { id: trackId, title: itSong.trackName, artist: seed.name },
              coverUrl
            );
            preloadCoverImage(coverUrl);
          }

          selectedTracks.push({
            id: trackId,
            title: itSong.trackName,
            name: itSong.trackName,
            artist: seed.name,
            album: itSong.collectionName || seed.name,
            fileName: `${itSong.trackName}.webm`,
            fileSize: 0,
            importedAt: 1700000000000 + score,
            audioUrl: streamUrl,
            downloadUrl: streamUrl,
            src: streamUrl,
            image: coverUrl,
            duration: validYt.duration || itSong.durationSec || 230,
            source: "YouTube",
            qualityBadge: (validYt.qualityBadge || "High (160kbps)") as QualityTier,
            bitrate: validYt.bitrate || 160,
            codec: validYt.codec || "Opus",
            mimeType: validYt.mimeType || "audio/webm",
            format: `YouTube (${validYt.codec || "Opus"} ${validYt.bitrate || 160}kbps)`,
            qualityVerified: true,
            year: itSong.year || 2024,
            trendingScore: score,
          });
        }
      }
    }

    if (selectedTracks.length < 5) {
      const moreYt = await searchYouTube(`${seed.name} ${config.label} hit songs`);
      for (const yt of moreYt) {
        if (selectedTracks.length >= 5) break;
        const ytId = extractCleanYouTubeId(yt.id || yt.downloadUrl);
        if (!/^[\w-]{11}$/.test(ytId) || usedSongKeys.has(ytId)) continue;
        const meta = `${yt.name || ""} ${yt.artist || ""}`;
        if (UNWANTED_TRACK_REGEX.test(meta)) continue;
        if (yt.duration > 0 && (yt.duration < 85 || yt.duration > 900)) continue;

        usedSongKeys.add(ytId);
        const slotIdx = selectedTracks.length;
        const trackId = `api-${config.langId}-${artistIdx + 1}-${slotIdx + 1}`;
        const score = seed.basePopularity + (rankBonuses[slotIdx] || 20);
        const coverUrl = defaultArtistCover || yt.image;
        const streamUrl = yt.downloadUrl || `yt-stream://${ytId}`;

        if (coverUrl) {
          rememberStickyCover({ id: trackId, title: yt.name, artist: seed.name }, coverUrl);
          preloadCoverImage(coverUrl);
        }

        selectedTracks.push({
          id: trackId,
          title: yt.name,
          name: yt.name,
          artist: seed.name,
          album: seed.name,
          fileName: `${yt.name}.webm`,
          fileSize: 0,
          importedAt: 1700000000000 + score,
          audioUrl: streamUrl,
          downloadUrl: streamUrl,
          src: streamUrl,
          image: coverUrl,
          duration: yt.duration || 230,
          source: "YouTube",
          qualityBadge: (yt.qualityBadge || "High (160kbps)") as QualityTier,
          bitrate: validYtBitrate(yt.bitrate),
          codec: yt.codec || "Opus",
          mimeType: yt.mimeType || "audio/webm",
          format: `YouTube (${yt.codec || "Opus"} ${validYtBitrate(yt.bitrate)}kbps)`,
          qualityVerified: true,
          year: 2024,
          trendingScore: score,
        });
      }
    }
  }

  return selectedTracks;
}

function validYtBitrate(b?: number): number {
  return typeof b === "number" && b > 0 ? b : 160;
}

const memoryCatalogByLang = new Map<string, TrendingTrackItem[]>();
const activePromisesByLang = new Map<string, Promise<TrendingTrackItem[]>>();

export function getCachedMultiLangTop200(langId: string): TrendingTrackItem[] {
  const mem = memoryCatalogByLang.get(langId);
  if (mem && mem.length > 0) return mem;
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(`${MULTI_LANG_CACHE_PREFIX}${langId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const realItems = parsed.filter(
        (item: any) =>
          item &&
          !String(item.id || "").includes("-seed-") &&
          !String(item.audioUrl || "").startsWith("trending-resolve://") &&
          !/—\s*Top Hit$|\(\d+\)$/.test(String(item.title || ""))
      );
      if (realItems.length > 0) {
        memoryCatalogByLang.set(langId, realItems);
        for (const item of realItems) {
          if (item?.image) rememberStickyCover(item, item.image);
        }
        return realItems;
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function getInstantMultiLangTop200(langId: string): TrendingTrackItem[] {
  return getCachedMultiLangTop200(langId);
}

function saveCachedMultiLangTop200(langId: string, items: TrendingTrackItem[]): void {
  if (!items.length) return;
  memoryCatalogByLang.set(langId, items);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`${MULTI_LANG_CACHE_PREFIX}${langId}`, JSON.stringify(items));
    }
  } catch {
    try {
      // Evict older language/artist caches so localStorage never stays full
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (
          k &&
          k !== `${MULTI_LANG_CACHE_PREFIX}${langId}` &&
          (k.startsWith(MULTI_LANG_CACHE_PREFIX) ||
            k.startsWith("void-trending-cache-") ||
            k.startsWith("void-artist-top100-"))
        ) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove.slice(0, 4)) {
        localStorage.removeItem(k);
      }
      localStorage.setItem(`${MULTI_LANG_CACHE_PREFIX}${langId}`, JSON.stringify(items));
    } catch {
      /* ignore quota errors; memoryCatalogByLang holds the full catalog */
    }
  }
}

/**
 * Runs the 40-Artists × 5-Songs (200 songs) Deep-Search process for any supported Trending language.
 */
export async function fetchDeepSearchedMultiLangTop200(
  langId: string,
  externalSignal?: AbortSignal,
  onPartial?: (items: TrendingTrackItem[]) => void
): Promise<TrendingTrackItem[]> {
  const config = MULTI_LANG_TOP_40_ARTISTS[langId];
  if (!config) return [];

  const cached = getCachedMultiLangTop200(langId);
  if (cached.length >= 160) {
    if (onPartial) onPartial(cached);
    return cached;
  }

  if (activePromisesByLang.has(langId)) {
    const existing = await activePromisesByLang.get(langId)!;
    if (!externalSignal?.aborted && onPartial && existing.length > 0) {
      onPartial(existing);
    }
    return existing;
  }

  const task = (async () => {
    const collected: Omit<TrendingTrackItem, "trendingRank">[] = [];

    const buildRanked = (): TrendingTrackItem[] => {
      const sorted = [...collected].sort((a, b) => b.trendingScore - a.trendingScore);
      const deduped = deduplicateTrackCollection(sorted, {
        ignoreArtist: false,
        cleanTitles: true,
      });
      return deduped.map((item, idx) => ({
        ...item,
        trendingRank: idx + 1,
      }));
    };

    // High-concurrency batches of 12 artists with immediate per-artist streaming
    for (let i = 0; i < config.artists.length; i += 12) {
      const batch = config.artists.slice(i, i + 12);
      await Promise.allSettled(
        batch.map(async (seed, bIdx) => {
          const tracks = await deepSearch5SongsForLanguageArtist(config, seed, i + bIdx);
          if (tracks.length > 0) {
            collected.push(...tracks);
            const snapshot = buildRanked();
            if (snapshot.length >= 10 && !externalSignal?.aborted && onPartial) {
              onPartial(snapshot);
            }
          }
        })
      );

      const snapshot = buildRanked();
      if (snapshot.length > 0 && !externalSignal?.aborted && onPartial) {
        onPartial(snapshot);
      }
    }

    const finalRanked = buildRanked();
    if (finalRanked.length > 0) {
      saveCachedMultiLangTop200(langId, finalRanked);
    }
    return finalRanked;
  })();

  activePromisesByLang.set(langId, task);
  try {
    return await task;
  } finally {
    activePromisesByLang.delete(langId);
  }
}
