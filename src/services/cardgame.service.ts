import axios from "axios";
import sharp from "sharp";
import fs from "fs-extra";
import Datastore from "@seald-io/nedb";
import { Character, GameSession, UserCard } from "../interfaces/cardgame.interface.js";
import { UserService } from "./user.service.js";
import { HTTP_TIMEOUT } from "../utils/general.util.js";


// Databases
export const charCacheDb = new Datastore({ filename: "./storage/databases/char_cache.db", autoload: true });
export const userCardsDb = new Datastore({ filename: "./storage/databases/user_cards.db", autoload: true });

// AniList GraphQL Endpoint
const ANILIST_API = "https://graphql.anilist.co";

// IGDB API Config (uses Twitch OAuth2)
const IGDB_CLIENT_ID = "nho5mcg8de5un2ch8b0t0ungcc1hth";
const IGDB_CLIENT_SECRET = "kri5f0c36wm0n1ceme3yh9ot5bzzdx";
const IGDB_API = "https://api.igdb.com/v4";

// Cache for IGDB Token
let igdbToken: string | null = null;
let igdbTokenExpires = 0;

// Gacha Rarity Weights (Configurable)
const GACHA_WEIGHTS = {
    1: 50, // Comum
    2: 30, // Incomum
    3: 20, // Raro
    4: 10, // Épico
    5: 5   // Lendário
};

export class CardGameService {
    private static instance: CardGameService;
    private activeSessions: Map<string, GameSession> = new Map();
    private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();

    private constructor() {
        if (!fs.existsSync("./storage/databases")) {
            fs.mkdirSync("./storage/databases", { recursive: true });
        }
        charCacheDb.ensureIndex({ fieldName: "id", unique: true });
        userCardsDb.ensureIndex({ fieldName: "id", unique: true });
    }

    public static getInstance(): CardGameService {
        if (!CardGameService.instance) {
            CardGameService.instance = new CardGameService();
        }
        return CardGameService.instance;
    }

    /**
     * Weighted random rarity pick based on Gacha weights.
     */
    private pickRarity(): number {
        const totalWeight = Object.values(GACHA_WEIGHTS).reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        for (const [rarity, weight] of Object.entries(GACHA_WEIGHTS)) {
            random -= weight;
            if (random <= 0) return parseInt(rarity);
        }
        return 1; // Fallback to common
    }

    /**
     * Authenticates with Twitch to get IGDB bearer token.
     */
    private async getIgdbToken(): Promise<string> {
        if (igdbToken && Date.now() < igdbTokenExpires) {
            return igdbToken;
        }

        const { data } = await axios.post(
            `https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
            undefined,
            { timeout: HTTP_TIMEOUT.api }
        );

        igdbToken = data.access_token;
        igdbTokenExpires = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min early
        return igdbToken!;
    }

    /**
     * Fetches a random character from IGDB API.
     */
    private async fetchFromIGDB(targetRarity: number): Promise<Character | null> {
        try {
            const token = await this.getIgdbToken();

            // Map rarity to IGDB rating brackets
            const ratingBrackets: { [key: number]: { min: number; max: number } } = {
                1: { min: 0, max: 40 },
                2: { min: 40, max: 60 },
                3: { min: 60, max: 75 },
                4: { min: 75, max: 90 },
                5: { min: 90, max: 100 }
            };
            const bracket = ratingBrackets[targetRarity] || ratingBrackets[1];

            const offset = Math.floor(Math.random() * 100);
            const query = `
                fields name, rating, cover.url, involved_companies.company.name;
                where rating >= ${bracket.min} & rating < ${bracket.max} & cover != null;
                sort rating desc;
                limit 10;
                offset ${offset};
            `;

            const { data: games } = await axios.post(`${IGDB_API}/games`, query, { timeout: HTTP_TIMEOUT.api,
                headers: {
                    'Client-ID': IGDB_CLIENT_ID,
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'text/plain'
                }
            });

            if (!games || games.length === 0) return null;

            const game = games[Math.floor(Math.random() * games.length)];
            const imageUrl = game.cover?.url ? `https:${game.cover.url.replace('t_thumb', 't_cover_big')}` : null;

            if (!imageUrl) return null;

            const character: Character = {
                id: game.id + 1000000, // Offset to avoid collision with AniList IDs
                name: game.name,
                image_url: imageUrl,
                source: "GAME",
                source_title: game.involved_companies?.[0]?.company?.name || "Gaming",
                description: "",
                popularity: Math.round(game.rating * 1000) || 0,
                rarity: targetRarity,
                discovered_at: Date.now()
            };

            await charCacheDb.updateAsync({ id: character.id }, character, { upsert: true });
            return character;
        } catch (err) {
            console.error("IGDB Error:", err);
            return null;
        }
    }

    /**
     * Fetches a random character from AniList API filtered by rarity.
     */
    private async fetchFromAniList(targetRarity: number): Promise<Character> {
        // Map rarity to popularity page ranges
        const pageRanges: { [key: number]: { min: number; max: number } } = {
            1: { min: 200, max: 500 },  // Low popularity
            2: { min: 100, max: 200 },
            3: { min: 50, max: 100 },
            4: { min: 20, max: 50 },
            5: { min: 1, max: 20 }      // Top popularity
        };
        const range = pageRanges[targetRarity] || pageRanges[1];
        const page = Math.floor(Math.random() * (range.max - range.min)) + range.min;
        const perPage = 10;
        const randomIndex = Math.floor(Math.random() * perPage);

        const query = `
            query ($page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    characters(sort: FAVOURITES_DESC) {
                        id
                        name {
                            full
                            native
                        }
                        image {
                            large
                        }
                        description(asHtml: false)
                        favourites
                        media(perPage: 1) {
                            nodes {
                                title {
                                    romaji
                                }
                                type
                            }
                        }
                    }
                }
            }
        `;

        const response = await axios.post(ANILIST_API, {
            query,
            variables: { page, perPage }
        }, { timeout: HTTP_TIMEOUT.api });

        const characters = response.data.data.Page.characters;
        if (!characters || characters.length === 0) {
            throw new Error("Nenhum personagem encontrado na API.");
        }

        const char = characters[randomIndex] || characters[0];
        const media = char.media?.nodes?.[0];

        const character: Character = {
            id: char.id,
            name: char.name.full,
            name_native: char.name.native,
            image_url: char.image.large,
            source: media?.type || "ANIME",
            source_title: media?.title?.romaji || "Desconhecido",
            description: char.description?.substring(0, 300) || "",
            popularity: char.favourites || 0,
            rarity: targetRarity, // Use the target rarity, not calculated
            discovered_at: Date.now()
        };

        // Cache the character locally
        await charCacheDb.updateAsync({ id: character.id }, character, { upsert: true });

        return character;
    }

    /**
     * Main method: Fetches a random character using Gacha logic and Duo-API.
     */
    public async fetchRandomCharacter(): Promise<Character> {
        const targetRarity = this.pickRarity();
        const useIGDB = Math.random() < 0.5; // 50% chance for each API

        if (useIGDB) {
            const gameChar = await this.fetchFromIGDB(targetRarity);
            if (gameChar) return gameChar;
        }

        // Fallback to AniList
        return this.fetchFromAniList(targetRarity);
    }


    /**
     * Processes an image via Sharp: downloads, resizes, and converts to WebP.
     * Includes a robust fallback if the image cannot be downloaded or processed.
     */
    public async processImage(imageUrl: string): Promise<Buffer> {
        try {
            const response = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 8000 });
            const imageBuffer = Buffer.from(response.data);

            const processedImage = await sharp(imageBuffer)
                .resize(400, 600, { fit: "cover", position: "center" })
                .webp({ quality: 75 })
                .toBuffer();

            return processedImage;
        } catch (err) {
            console.error(`Error processing image ${imageUrl}, generating fallback:`, err);

            // Fallback: Generate a professional placeholder with Sharp
            // A dark background with a 1px border is sometimes better than nothing
            const fallback = await sharp({
                create: {
                    width: 400,
                    height: 600,
                    channels: 4,
                    background: { r: 40, g: 44, b: 52, alpha: 1 } // Dark slate color
                }
            })
                .webp()
                .toBuffer();

            return fallback;
        }
    }

    /**
     * Generates a random claim code.
     */
    public generateClaimCode(): string {
        return Math.floor(100 + Math.random() * 900).toString();
    }

    /**
     * Creates a game session for a chat.
     */
    public createSession(chatId: string, character: Character): GameSession {
        const claimCode = this.generateClaimCode();
        const session: GameSession = {
            chat_id: chatId,
            claim_code: claimCode,
            character,
            expires_at: Date.now() + 60000 // 60 seconds
        };

        // Clear any existing session for this chat
        this.clearSession(chatId);

        this.activeSessions.set(chatId, session);

        // Auto-expire after 60 seconds
        const timeout = setTimeout(() => {
            this.clearSession(chatId);
        }, 60000);
        this.sessionTimeouts.set(chatId, timeout);

        return session;
    }

    /**
     * Attempts to claim a character with new XP formulas.
     */
    public async tryClaim(chatId: string, userId: string, code: string): Promise<{ success: boolean; character?: Character; message: string }> {
        const session = this.activeSessions.get(chatId);

        if (!session) {
            return { success: false, message: "Não há nenhum personagem disponível para casar neste chat." };
        }

        if (session.claimed_by) {
            return { success: false, message: "Este personagem já foi conquistado!" };
        }

        if (session.claim_code !== code) {
            return { success: false, message: "" }; // Silent fail for wrong codes
        }

        // Atomic claim
        session.claimed_by = userId;

        const userService = UserService.getInstance();
        const globalCount = await userCardsDb.countAsync({ character_id: session.character.id });

        const userCard: UserCard = {
            id: `${userId}_${session.character.id}_${Date.now()}`,
            user_id: userId,
            character_id: session.character.id,
            claimed_at: Date.now(),
            serial_number: globalCount + 1
        };

        await userCardsDb.insertAsync(userCard);
        await userService.incrementCardsCollected(userId);

        // --- NEW XP SYSTEM ---
        const user = await userService.getUser(userId);
        const collected = user?.cards_collected || 0;
        let xpReward = session.character.rarity; // Base: 1 estrela = 1 XP
        let bonusMsg = "";

        // 14-Card Milestone Bonus
        if (collected > 0 && collected % 14 === 0) {
            const lastCards = await userCardsDb.findAsync({ user_id: userId }).sort({ claimed_at: -1 }).limit(2) as unknown as UserCard[];
            let last2Rarity = 0;
            for (const c of lastCards) {
                const char = await this.getCharacterById(c.character_id);
                last2Rarity += char?.rarity || 1;
            }
            const milestoneBonus = last2Rarity + (5 * session.character.rarity * 5);
            xpReward += milestoneBonus;
            bonusMsg = `\n\n🎯 *Milestone de 14 Cartas!* Bônus: *+${milestoneBonus} XP*!`;
        }

        // Weekly Streak Bonus (7 consecutive days)
        const hasWeeklyStreak = await userService.checkAndResetWeeklyStreak(userId);
        if (hasWeeklyStreak) {
            const lastCards = await userCardsDb.findAsync({ user_id: userId }).sort({ claimed_at: -1 }).limit(4) as unknown as UserCard[];
            let last4Rarity = 0;
            for (const c of lastCards) {
                const char = await this.getCharacterById(c.character_id);
                last4Rarity += char?.rarity || 1;
            }
            const weeklyBonus = last4Rarity + (5 * session.character.rarity * 5);
            xpReward += weeklyBonus;
            bonusMsg += `\n\n🔥 *Bônus Semanal!* (7 dias jogando) *+${weeklyBonus} XP*!`;
        }

        await userService.addXp(userId, xpReward);
        this.clearSession(chatId);

        let successMsg = `💍 Parabéns! Você casou com *${session.character.name}*! (Serial #${userCard.serial_number})`;
        successMsg += `\n✨ Ganhou *${xpReward} XP*!`;
        successMsg += bonusMsg;

        return { success: true, character: session.character, message: successMsg };
    }

    /**
     * Clears an active session.
     */
    public clearSession(chatId: string): void {
        this.activeSessions.delete(chatId);
        const timeout = this.sessionTimeouts.get(chatId);
        if (timeout) {
            clearTimeout(timeout);
            this.sessionTimeouts.delete(chatId);
        }
    }

    /**
     * Gets a user's collection.
     */
    public async getUserCollection(userId: string): Promise<UserCard[]> {
        return userCardsDb.findAsync({ user_id: userId }).sort({ claimed_at: -1 }) as unknown as UserCard[];
    }

    /**
     * Gets a character by ID from cache.
     */
    public async getCharacterById(charId: number): Promise<Character | null> {
        return charCacheDb.findOneAsync({ id: charId }) as unknown as Character | null;
    }

    /**
     * Gets a specific user card by its unique ID.
     */
    public async getUserCardById(cardId: string): Promise<UserCard | null> {
        return userCardsDb.findOneAsync({ id: cardId }) as unknown as UserCard | null;
    }

    /**
     * Transfers a card from one user to another.
     */
    public async transferCard(cardId: string, fromUserId: string, toUserId: string): Promise<boolean> {
        const card = await this.getUserCardById(cardId);
        if (!card || card.user_id !== fromUserId) return false;

        await userCardsDb.updateAsync({ id: cardId }, { $set: { user_id: toUserId } });
        return true;
    }

    /**
     * Deletes a card (used for selling).
     */
    public async deleteCard(cardId: string, userId: string): Promise<boolean> {
        const card = await this.getUserCardById(cardId);
        if (!card || card.user_id !== userId) return false;

        await userCardsDb.removeAsync({ id: cardId }, {});
        return true;
    }
}
