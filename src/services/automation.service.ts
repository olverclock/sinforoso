import { WASocket, WAMessage } from "baileys";
import axios from "axios";
import * as waUtil from "../utils/whatsapp.util.js";
import { GroupService } from "./group.service.js";
import { ParticipantService } from "./participant.service.js";
import { UserService } from "./user.service.js";
import { FreeStuffService } from "./freestuff.service.js";
import { User } from "../interfaces/user.interface.js";
import { randomDelay, showConsoleError, HTTP_TIMEOUT } from "../utils/general.util.js";
import { newsGoogle } from "../utils/misc.util.js";
import { JSDOM, VirtualConsole } from "jsdom";

/** Itens que não são notícia: transmissões ao vivo e listas de vídeos do g1. */
const NOT_NEWS = /(ao vivo|^v[ií]deos?:|^assista|^ouça|^podcast)/i

/** Lê o RSS do g1 como XML (funciona com ou sem CDATA). */
export async function fetchG1News(limit = 6): Promise<{ title: string, link: string, extra?: string }[]> {
    const { data: xml } = await axios.get<string>('https://g1.globo.com/rss/g1/', { timeout: HTTP_TIMEOUT.scraping, responseType: 'text' })
    const { window: { document } } = new JSDOM(xml, { contentType: 'text/xml', virtualConsole: new VirtualConsole() })
    const items: { title: string, link: string }[] = []
    for (const item of document.querySelectorAll('item')) {
        const title = item.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
        const link = item.querySelector('link')?.textContent?.trim() ?? ''
        // Matérias do g1 ficam em ".../noticia/..."; páginas de "ao vivo" e vídeos não
        if (!title || !link.includes('/noticia/') || NOT_NEWS.test(title)) continue
        items.push({ title, link })
        if (items.length >= limit) break
    }
    return items
}


export class AutomationService {
    private static instance: AutomationService;
    private groupService: GroupService;
    private participantService: ParticipantService;
    private gameTimeouts: Map<string, NodeJS.Timeout> = new Map();
    // Monitor de jogos grátis: um único intervalo por processo, sempre usando o socket mais recente
    // (connect() é chamado de novo a cada reconexão e o socket antigo fica fechado).
    private freeGamesStarted = false;
    private freeGamesClient?: WASocket;

    private constructor() {
        this.groupService = new GroupService();
        this.participantService = new ParticipantService();
    }

    public static getInstance(): AutomationService {
        if (!AutomationService.instance) {
            AutomationService.instance = new AutomationService();
        }
        return AutomationService.instance;
    }

    /**
     * Agenda a deleção de uma mensagem após um período (Janitor).
     */
    public scheduleDeletion(client: WASocket, chatId: string, message: WAMessage, delayMs: number = 60000) {
        setTimeout(async () => {
            try {
                const group = await this.groupService.getGroup(chatId);
                if (group?.janitor_status) {
                    await waUtil.deleteMessage(client, message, false);
                }
            } catch (error) {
                console.error("Janitor: Erro ao deletar mensagem agendada:", error);
            }
        }, delayMs);
    }

    /**
     * Principais notícias do Brasil: feed RSS público do g1 e, se ele falhar ou vier vazio, o
     * Google Notícias. O g1 deixou de usar <![CDATA[...]]> nos títulos (a leitura antiga não achava
     * nada) e o feed traz itens de "TV ao vivo" e "VÍDEOS", que são ignorados.
     */
    public async fetchNews(limit = 6): Promise<string> {
        try {
            // g1 fora do ar ou com erro: segue para o Google Notícias
            let items = await fetchG1News(limit).catch(err => { showConsoleError(err, "NOTICIAS_G1"); return [] })
            let source = 'G1'
            if (!items.length) {
                items = (await newsGoogle()).slice(0, limit).map(n => ({ title: n.title, link: n.url, extra: n.author }))
                source = 'Google Notícias'
            }
            if (!items.length) return "❌ Desculpe, não consegui buscar as notícias no momento."
            let newsMsg = `📰 *NOTÍCIAS DO MOMENTO (${source})* 📰\n\n`
            for (const item of items) newsMsg += `🔹 *${item.title}*${item.extra ? ` _(${item.extra})_` : ''}\n🔗 ${item.link}\n\n`
            return newsMsg.trim()
        } catch (error) {
            showConsoleError(error, "NOTICIAS")
            return "❌ Desculpe, não consegui buscar as notícias no momento."
        }
    }

    /**
     * Gera um resumo diário para o grupo.
     */
    public async generateDailySummary(groupId: string): Promise<string> {
        const group = await this.groupService.getGroup(groupId);
        if (!group) return "";

        const participants = await this.participantService.getParticipantsFromGroup(groupId);
        if (!participants.length) return "";

        const topActive = participants.sort((a, b) => (b.msgs || 0) - (a.msgs || 0))[0];
        const topXP = participants.sort((a, b) => (b.xp || 0) - (a.xp || 0))[0];
        const totalMsgs = participants.reduce((acc, p) => acc + (p.msgs || 0), 0);

        let summary = `📅 *RESUMO DIÁRIO - ${group.name}* 📅\n\n`;
        summary += `📊 *Estatísticas:* \n`;
        summary += `💬 Total de mensagens: *${totalMsgs}*\n\n`;

        if (topActive) {
            summary += `🏆 *Membro mais Falador:* @${waUtil.removeWhatsappSuffix(topActive.user_id)} (${topActive.msgs} msgs)\n`;
        }

        if (topXP) {
            summary += `✨ *Membro com mais XP (Lendário):* @${waUtil.removeWhatsappSuffix(topXP.user_id)} (Nível ${topXP.level})\n\n`;
        }

        summary += `Use !perfil para ver seu progresso e !showdomilhao para ganhar mais XP!`;

        return summary;
    }

    /**
     * Agenda a expiração de um jogo se não for respondido.
     */
    public scheduleGameExpiration(client: WASocket, chatId: string, expirationTime: number = 45000) {
        // Limpa timer anterior se houver
        this.clearGameTimeout(chatId);

        const timeout = setTimeout(async () => {
            // Callback de timer: um erro aqui (ex.: envio falhou porque o bot saiu do grupo ou a
            // conexão caiu) seria uma rejeição não tratada, que encerra o processo no Node 24.
            try {
                const gameService = (await import("./game.service.js")).GameService.getInstance();
                const game = gameService.getActiveGame(chatId);

                if (game && game.status === 'waiting_answer') {
                    const timePassed = Date.now() - game.lastTime;
                    if (timePassed >= expirationTime - 1000) { // Margem de erro de 1s
                        gameService.expireGame(chatId);
                        await waUtil.sendText(client, chatId, "⏱️ *TEMPO ESGOTADO!* O jogo foi encerrado por inatividade.");
                    }
                }
            } catch (err) {
                showConsoleError(err, "GAME_EXPIRATION_TIMER");
            } finally {
                this.gameTimeouts.delete(chatId);
            }
        }, expirationTime + 500);

        this.gameTimeouts.set(chatId, timeout);
    }

    /**
     * Limpa o cronômetro de um jogo específico.
     */
    public clearGameTimeout(chatId: string) {
        if (this.gameTimeouts.has(chatId)) {
            clearTimeout(this.gameTimeouts.get(chatId));
            this.gameTimeouts.delete(chatId);
        }
    }

    /**
     * Inicia o monitor de jogos grátis.
     * Verifica novos brindes a cada 1 hora e avisa os inscritos.
     */
    public async startFreeGamesMonitor(client: WASocket) {
        const freeService = FreeStuffService.getInstance();
        const userService = UserService.getInstance();

        // Reconexão: só troca o socket usado pelo monitor já existente (não cria outro intervalo
        // nem repopula o histórico, o que descartaria ofertas ainda não notificadas).
        this.freeGamesClient = client;
        if (this.freeGamesStarted) return;
        this.freeGamesStarted = true; // marcado antes do primeiro await para evitar duas inicializações simultâneas

        // Primeira execução imediata para popular o histórico
        try {
            const initialGiveaways = await freeService.getGiveaways();
            freeService.getNewGiveaways(initialGiveaways);
        } catch (e) { }

        setInterval(async () => {
            const client = this.freeGamesClient;
            if (!client) return;
            try {
                const giveaways = await freeService.getGiveaways();
                const newGiveaways = freeService.getNewGiveaways(giveaways);

                if (newGiveaways.length > 0) {
                    const allUsers = await userService.getUsers();
                    const subscribedUsers = allUsers.filter((u: User) => u.free_games_sub);

                    // Safety Cap: Notifica no máximo os 3 mais recentes no automático
                    const alertList = newGiveaways.slice(0, 3);
                    const hasMore = newGiveaways.length > 3;

                    for (const user of subscribedUsers) {
                        const mode = user.free_games_mode || "completo";
                        for (const giveaway of alertList) {
                            const formatted = await freeService.formatGiveaway(giveaway, mode);
                            await waUtil.sendText(client, user.id, formatted);

                            // Delay entre mensagens para o mesmo usuário (2-4s jitter)
                            await randomDelay(2000, 4500);
                        }

                        if (hasMore) {
                            await waUtil.sendText(client, user.id, `➕ *MAIS JOGOS:* Existem mais ofertas gratuitas disponíveis! Use *!free* para ver a lista completa.`);
                        }

                        // GLOBAL PACING: Delay entre usuários diferentes (7-15s jitter)
                        // Isso evita que o WhatsApp detecte um padrão de envio em massa instantâneo
                        await randomDelay(7000, 15000);
                    }
                }
            } catch (error) {
                console.error("FreeGamesMonitor (Automation): Erro técnico:", error);
            }
        }, 60 * 60 * 1000);
    }
}

// Agenda a auto-exclusão (Janitor) de cada mensagem enviada por sendText/replyText
// sem que utils/ dependa de services/ (ARCH-011). Mesmo comportamento do antigo
// `AutomationService.getInstance().scheduleDeletion(client, chatId, sent)` em whatsapp.util.
waUtil.setSentMessageListener((client, chatId, sent) => AutomationService.getInstance().scheduleDeletion(client, chatId, sent));
