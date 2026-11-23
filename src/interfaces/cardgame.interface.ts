export interface Character {
    id: number;
    name: string;
    name_native?: string;
    image_url: string;
    source: string; // Anime, Game, Manga
    source_title: string;
    description?: string;
    rarity: number; // 1-5 based on popularity
    popularity: number; // Raw popularity score from API
    discovered_at: number; // Timestamp
}

export interface UserCard {
    id: string; // unique ID for the card instance
    user_id: string;
    character_id: number;
    claimed_at: number;
    serial_number: number; // nth person to claim this character globally
}

export interface GameSession {
    chat_id: string;
    claim_code: string;
    character: Character;
    expires_at: number;
    claimed_by?: string;
}
