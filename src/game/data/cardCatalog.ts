export type CardCatalogCategory =
    | 'character'
    | 'item'
    | 'supporter'
    | 'stadium'
    | 'tool'
    | 'status_effect';

export type CharacterCardType =
    | 'brass'
    | 'choir'
    | 'guitars'
    | 'percussion'
    | 'pianos'
    | 'strings'
    | 'woodwinds';

export type CardCatalogEntry = {
    id: string;
    label: string;
    category: CardCatalogCategory;
    cardType?: CharacterCardType;
    // Future-ready icon hook. If an asset is loaded under this key, UI can render it.
    iconKey?: string;
    // Fallback text/icon token when iconKey is unavailable.
    iconFallback: string;
};

export const CARD_CATALOG: CardCatalogEntry[] = [
    { id: 'BarronLee', label: 'Barron Lee', category: 'character', cardType: 'brass', iconFallback: 'BAR' },
    { id: 'CarolynZheng', label: 'Carolyn Zheng', category: 'character', cardType: 'brass', iconFallback: 'CAR' },
    { id: 'FilipKaminski', label: 'Filip Kaminski', category: 'character', cardType: 'brass', iconFallback: 'FIL' },
    { id: 'JuanBurgos', label: 'Juan Burgos', category: 'character', cardType: 'brass', iconFallback: 'JUA' },
    { id: 'VincentChen', label: 'Vincent Chen', category: 'character', cardType: 'brass', iconFallback: 'VIN' },
    { id: 'HappyRuthJara', label: 'Happy Ruth Jara', category: 'character', cardType: 'choir', iconFallback: 'HAP' },
    { id: 'RachelChen', label: 'Rachel Chen', category: 'character', cardType: 'choir', iconFallback: 'RAC' },
    { id: 'RossWilliams', label: 'Ross Williams', category: 'character', cardType: 'choir', iconFallback: 'ROS' },
    { id: 'RyanDu', label: 'Ryan Du', category: 'character', cardType: 'choir', iconFallback: 'RYA' },
    { id: 'YanwanZhu', label: 'Yanwan Zhu', category: 'character', cardType: 'choir', iconFallback: 'YAN' },
    { id: 'AntongChen', label: 'Antong Chen', category: 'character', cardType: 'guitars', iconFallback: 'ANT' },
    { id: 'BenCherekIII', label: 'Ben Cherek III', category: 'character', cardType: 'guitars', iconFallback: 'BEN' },
    { id: 'ChristmasKim', label: 'Christmas Kim', category: 'character', cardType: 'guitars', iconFallback: 'CHR' },
    { id: 'EdwardWibowo', label: 'Edward Wibowo', category: 'character', cardType: 'guitars', iconFallback: 'EDW' },
    { id: 'GraceZhao', label: 'Grace Zhao', category: 'character', cardType: 'guitars', iconFallback: 'GRA' },
    { id: 'MeyaGao', label: 'Meya Gao', category: 'character', cardType: 'guitars', iconFallback: 'MEY' },
    { id: 'OwenLandry', label: 'Owen Landry', category: 'character', cardType: 'guitars', iconFallback: 'OWE' },
    { id: 'RobertoGonzales', label: 'Roberto Gonzales', category: 'character', cardType: 'guitars', iconFallback: 'ROB' },
    { id: 'BokaiBi', label: 'Bokai Bi', category: 'character', cardType: 'percussion', iconFallback: 'BOK' },
    { id: 'CavinXue', label: 'Cavin Xue', category: 'character', cardType: 'percussion', iconFallback: 'CAV' },
    { id: 'DanielYang', label: 'Daniel Yang', category: 'character', cardType: 'pianos', iconFallback: 'DAN' },
    { id: 'EugeniaAmpofo', label: 'Eugenia Ampofo', category: 'character', cardType: 'percussion', iconFallback: 'EUG' },
    { id: 'HanleiGao', label: 'Hanlei Gao', category: 'character', cardType: 'percussion', iconFallback: 'HAN' },
    { id: 'KeiWatanabe', label: 'Kei Watanabe', category: 'character', cardType: 'percussion', iconFallback: 'KEI' },
    { id: 'KevinYang', label: 'Kevin Yang', category: 'character', cardType: 'percussion', iconFallback: 'KEV' },
    { id: 'LoangChiang', label: 'Loang Chiang', category: 'character', cardType: 'percussion', iconFallback: 'LOA' },
    { id: 'PascalKim', label: 'Pascal Kim', category: 'character', cardType: 'percussion', iconFallback: 'PAS' },
    { id: 'RyanLee', label: 'Ryan Lee', category: 'character', cardType: 'percussion', iconFallback: 'RYA' },
    { id: 'SasMajumder', label: 'Sas Majumder', category: 'character', cardType: 'percussion', iconFallback: 'SAS' },
    { id: 'CathyRong', label: 'Cathy Rong', category: 'character', cardType: 'pianos', iconFallback: 'CAT' },
    { id: 'CocoZeng', label: 'Coco Zeng', category: 'character', cardType: 'pianos', iconFallback: 'COC' },
    { id: 'DavidMan', label: 'David Man', category: 'character', cardType: 'pianos', iconFallback: 'DAV' },
    { id: 'DemiLu', label: 'Demi Lu', category: 'character', cardType: 'pianos', iconFallback: 'DEM' },
    { id: 'HenryWang', label: 'Henry Wang', category: 'character', cardType: 'pianos', iconFallback: 'HEN' },
    { id: 'JennieWang', label: 'Jennie Wang', category: 'character', cardType: 'pianos', iconFallback: 'JEN' },
    { id: 'JoshuaKou', label: 'Joshua Kou', category: 'character', cardType: 'pianos', iconFallback: 'JOS' },
    { id: 'KatieXiang', label: 'Katie Xiang', category: 'character', cardType: 'pianos', iconFallback: 'KAT' },
    { id: 'LukeXu', label: 'Luke Xu', category: 'character', cardType: 'pianos', iconFallback: 'LUK' },
    { id: 'MatthewWang', label: 'Matthew Wang', category: 'character', cardType: 'pianos', iconFallback: 'MAT' },
    { id: 'RyanLi', label: 'Ryan Li', category: 'character', cardType: 'pianos', iconFallback: 'RYA' },
    { id: 'SophiaSWang', label: 'Sophia S Wang', category: 'character', cardType: 'pianos', iconFallback: 'SOP' },
    { id: 'AliceWang', label: 'Alice Wang', category: 'character', cardType: 'strings', iconFallback: 'ALI' },
    { id: 'AndreaCR', label: 'Andrea Condormango Rafael', category: 'character', cardType: 'strings', iconFallback: 'AND' },
    { id: 'AshleyToby', label: 'Ashley Toby', category: 'character', cardType: 'strings', iconFallback: 'ASH' },
    { id: 'EmilyWang', label: 'Emily Wang', category: 'character', cardType: 'strings', iconFallback: 'EMI' },
    { id: 'FionaLi', label: 'Fiona Li', category: 'character', cardType: 'strings', iconFallback: 'FIO' },
    { id: 'GabrielChen', label: 'Gabriel Chen', category: 'character', cardType: 'strings', iconFallback: 'GAB' },
    { id: 'InaMa', label: 'Ina Ma', category: 'character', cardType: 'strings', iconFallback: 'INA' },
    { id: 'IrisYang', label: 'Iris Yang', category: 'character', cardType: 'strings', iconFallback: 'IRI' },
    { id: 'JessicaJung', label: 'Jessica Jung', category: 'character', cardType: 'strings', iconFallback: 'JES' },
    { id: 'JuliaCeccarelli', label: 'Julia Ceccarelli', category: 'character', cardType: 'strings', iconFallback: 'JUL' },
    { id: 'MaggieLi', label: 'Maggie Li', category: 'character', cardType: 'strings', iconFallback: 'MAG' },
    { id: 'MasonYu', label: 'Mason Yu', category: 'character', cardType: 'strings', iconFallback: 'MAS' },
    { id: 'MichaelTu', label: 'Michael Tu', category: 'character', cardType: 'strings', iconFallback: 'MIC' },
    { id: 'MichelleKim', label: 'Michelle Kim', category: 'character', cardType: 'strings', iconFallback: 'MIC' },
    { id: 'SophiaYWang', label: 'Sophia Y Wang', category: 'character', cardType: 'strings', iconFallback: 'SOP' },
    { id: 'YuelinHu', label: 'Yuelin Hu', category: 'character', cardType: 'strings', iconFallback: 'YUE' },
    { id: 'AnaliseJia', label: 'Analise Jia', category: 'character', cardType: 'woodwinds', iconFallback: 'ANA' },
    { id: 'AnnaBrown', label: 'Anna Brown', category: 'character', cardType: 'woodwinds', iconFallback: 'ANN' },
    { id: 'BettySolomon', label: 'Betty Solomon', category: 'character', cardType: 'woodwinds', iconFallback: 'BET' },
    { id: 'DanielZhu', label: 'Daniel Zhu', category: 'character', cardType: 'woodwinds', iconFallback: 'DAN' },
    { id: 'DesmondRoper', label: 'Desmond Roper', category: 'character', cardType: 'woodwinds', iconFallback: 'DES' },
    { id: 'EvelynWu', label: 'Evelyn Wu', category: 'character', cardType: 'woodwinds', iconFallback: 'EVE' },
    { id: 'FelixChen', label: 'Felix Chen', category: 'character', cardType: 'woodwinds', iconFallback: 'FEL' },
    { id: 'HarperAitken', label: 'Harper Aitken', category: 'character', cardType: 'woodwinds', iconFallback: 'HAR' },
    { id: 'IzzyChen', label: 'Izzy Chen', category: 'character', cardType: 'woodwinds', iconFallback: 'IZZ' },
    { id: 'JaydenBrown', label: 'Jayden Brown', category: 'character', cardType: 'woodwinds', iconFallback: 'JAY' },
    { id: 'JordanRoosevelt', label: 'Jordan Roosevelt', category: 'character', cardType: 'woodwinds', iconFallback: 'JOR' },
    { id: 'KanaTakizawa', label: 'Kana Takizawa', category: 'character', cardType: 'woodwinds', iconFallback: 'KAN' },
    { id: 'KathySun', label: 'Kathy Sun', category: 'character', cardType: 'woodwinds', iconFallback: 'KAT' },
    { id: 'LucaChen', label: 'Luca Chen', category: 'character', cardType: 'woodwinds', iconFallback: 'LUC' },
    { id: 'MeiyiSong', label: 'Meiyi Song', category: 'character', cardType: 'woodwinds', iconFallback: 'MEI' },
    { id: 'RachaelYuan', label: 'Rachael Yuan', category: 'character', cardType: 'woodwinds', iconFallback: 'RAC' },
    { id: 'SarahChen', label: 'Sarah Chen', category: 'character', cardType: 'woodwinds', iconFallback: 'SAR' },
    { id: 'WestonPoe', label: 'Weston Poe', category: 'character', cardType: 'woodwinds', iconFallback: 'WES' },
    { id: 'AVGEBirb', label: 'AVGE Birb', category: 'item', iconFallback: 'AVG' },
    { id: 'AnnotatedScore', label: 'Annotated Score', category: 'item', iconFallback: 'ANN' },
    { id: 'BAIEmail', label: 'BAI Email', category: 'item', iconFallback: 'BAI' },
    { id: 'BUOStand', label: 'BUO Stand', category: 'item', iconFallback: 'BUO' },
    { id: 'Camera', label: 'Camera', category: 'item', iconFallback: 'CAM' },
    { id: 'CastReserve', label: 'Cast Reserve', category: 'item', iconFallback: 'CAS' },
    { id: 'ConcertProgram', label: 'Concert Program', category: 'item', iconFallback: 'CON' },
    { id: 'ConcertRoster', label: 'Concert Roster', category: 'item', iconFallback: 'CON' },
    { id: 'ConcertTicket', label: 'Concert Ticket', category: 'item', iconFallback: 'CON' },
    { id: 'CorruptedMusescoreFile', label: 'Corrupted Musescore File', category: 'item', iconFallback: 'COR' },
    { id: 'DressRehearsalRoster', label: 'Dress Rehearsal Roster', category: 'item', iconFallback: 'DRE' },
    { id: 'FoldingStand', label: 'Folding Stand', category: 'item', iconFallback: 'FOL' },
    { id: 'IceSkates', label: 'Ice Skates', category: 'item', iconFallback: 'ICE' },
    { id: 'MatchaLatte', label: 'Matcha Latte', category: 'item', iconFallback: 'MAT' },
    { id: 'MikuOtamatone', label: 'Miku Otamatone', category: 'item', iconFallback: 'MIK' },
    { id: 'Otamatone', label: 'Otamatone', category: 'item', iconFallback: 'OTO' },
    { id: 'PrintedScore', label: 'Printed Score', category: 'item', iconFallback: 'PRI' },
    { id: 'RaffleTicket', label: 'Raffle Ticket', category: 'item', iconFallback: 'RAF' },
    { id: 'StandardMusescoreFile', label: 'Standard Musescore File', category: 'item', iconFallback: 'STA' },
    { id: 'StrawberryMatchaLatte', label: 'Strawberry Matcha Latte', category: 'item', iconFallback: 'STR' },
    { id: 'VideoCamera', label: 'Video Camera', category: 'item', iconFallback: 'VID' },
    { id: 'Angel', label: 'Angel', category: 'supporter', iconFallback: 'ANG' },
    { id: 'Emma', label: 'Emma', category: 'supporter', iconFallback: 'EMM' },
    { id: 'Johann', label: 'Johann', category: 'supporter', iconFallback: 'JOH' },
    { id: 'Lio', label: 'Lio', category: 'supporter', iconFallback: 'LIO' },
    { id: 'Lucas', label: 'Lucas', category: 'supporter', iconFallback: 'LUC' },
    { id: 'Michelle', label: 'Michelle', category: 'supporter', iconFallback: 'MIC' },
    { id: 'Richard', label: 'Richard', category: 'supporter', iconFallback: 'RIC' },
    { id: 'Victoria', label: 'Victoria', category: 'supporter', iconFallback: 'VIC' },
    { id: 'Will', label: 'Will', category: 'supporter', iconFallback: 'WIL' },
    { id: 'AlumnaeHall', label: 'Alumnae Hall', category: 'stadium', iconFallback: 'ALU' },
    { id: 'FriedmanHall', label: 'Friedman Hall', category: 'stadium', iconFallback: 'FRI' },
    { id: 'LindemannPracticeRoom', label: 'Lindemann Practice Room', category: 'stadium', iconFallback: 'LIN' },
    { id: 'MainHall', label: 'Main Hall', category: 'stadium', iconFallback: 'MAI' },
    { id: 'PetterutiLounge', label: 'Petteruti Lounge', category: 'stadium', iconFallback: 'PET' },
    { id: 'RedRoom', label: 'Red Room', category: 'stadium', iconFallback: 'RED' },
    { id: 'RileyHall', label: 'Riley Hall', category: 'stadium', iconFallback: 'RIL' },
    { id: 'SalomonDECI', label: 'Salomon DECI', category: 'stadium', iconFallback: 'SAL' },
    { id: 'SteinertBasement', label: 'Steinert Basement', category: 'stadium', iconFallback: 'STE' },
    { id: 'SteinertPracticeRoom', label: 'Steinert Practice Room', category: 'stadium', iconFallback: 'STE' },
    { id: 'AVGEShowcaseSticker', label: 'AVGE Showcase Sticker', category: 'tool', iconFallback: 'AVG' },
    { id: 'AVGETShirt', label: 'AVGE T-Shirt', category: 'tool', iconFallback: 'AVG' },
    { id: 'Bucket', label: 'Bucket', category: 'tool', iconFallback: 'BUC' },
    { id: 'KikisHeadband', label: 'Kikis Headband', category: 'tool', iconFallback: 'KIK' },
    { id: 'MaidOutfit', label: 'Maid Outfit', category: 'tool', iconFallback: 'MAI' },
    { id: 'MusescoreSubscription', label: 'Musescore Subscription', category: 'tool', iconFallback: 'MUS' },
];

const normalizeCardCatalogLookupKey = (value: string): string => {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
};

const CARD_CATALOG_LABEL_BY_LOOKUP_KEY = new Map<string, string>();
for (const entry of CARD_CATALOG) {
    CARD_CATALOG_LABEL_BY_LOOKUP_KEY.set(normalizeCardCatalogLookupKey(entry.id), entry.label);
    CARD_CATALOG_LABEL_BY_LOOKUP_KEY.set(normalizeCardCatalogLookupKey(entry.label), entry.label);
}

export const resolveCardCatalogLabel = (value: string): string | null => {
    const lookupKey = normalizeCardCatalogLookupKey(value);
    if (lookupKey.length === 0) {
        return null;
    }

    return CARD_CATALOG_LABEL_BY_LOOKUP_KEY.get(lookupKey) ?? null;
};
