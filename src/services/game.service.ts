import { GameState, GameHelpResponse, GameHelpType } from "../interfaces/game.interface.js";
import { QUESTIONS } from "../data/questions.js";
import { ParticipantService } from "./participant.service.js";

export class GameService {
    private static instance: GameService;
    private activeGames: Map<string, GameState> = new Map();
    private participantService: ParticipantService;

    private constructor() {
        this.participantService = new ParticipantService();
    }

    public static getInstance(): GameService {
        if (!GameService.instance) {
            GameService.instance = new GameService();
        }
        return GameService.instance;
    }

    public async startGame(chatId: string, mode: 'private' | 'group', participants: string[]): Promise<GameState> {
        const initialState: GameState = {
            chatId,
            mode,
            participants,
            currentQuestionIndex: 0,
            helped: {
                pulos: 3,
                cartas: true,
                universitarios: true,
                placas: true
            },
            accumulatedPrize: 0,
            status: 'playing',
            lastTime: Date.now(),
            usedQuestionIds: []
        };

        this.activeGames.set(chatId, initialState);
        return this.nextQuestion(chatId);
    }

    public async nextQuestion(chatId: string): Promise<GameState> {
        const game = this.activeGames.get(chatId);
        if (!game) throw new Error("Jogo não encontrado.");

        game.currentQuestionIndex++;

        let level: 'Fácil' | 'Médio' | 'Difícil' = 'Fácil';
        if (game.currentQuestionIndex > 10) level = 'Difícil';
        else if (game.currentQuestionIndex > 5) level = 'Médio';

        // Filter by level AND exclude used questions (Strict check)
        const filteredQuestions = QUESTIONS.filter(q => q.level === level && !game.usedQuestionIds.includes(q.id));

        if (filteredQuestions.length === 0) {
            throw new Error("Não há mais perguntas disponíveis para este nível.");
        }

        // Better Randomization: Shuffle and pick first
        const shuffled = filteredQuestions.sort(() => Math.random() - 0.5);
        const randomQuestion = shuffled[0];

        if (!randomQuestion) throw new Error("Erro ao selecionar pergunta aleatória.");

        game.usedQuestionIds.push(randomQuestion.id);

        game.currentQuestion = randomQuestion;
        game.status = 'waiting_answer';
        game.lastTime = Date.now();

        return game;
    }

    public getActiveGame(chatId: string): GameState | undefined {
        return this.activeGames.get(chatId);
    }

    public async submitAnswer(chatId: string, userId: string, answerIndex: number): Promise<{ correct: boolean, gameOver: boolean, game: GameState }> {
        const game = this.activeGames.get(chatId);
        if (!game || !game.currentQuestion) throw new Error("Jogo ou pergunta não ativa.");

        const isCorrect = game.currentQuestion.answer === answerIndex;
        let gameOver = false;

        if (isCorrect) {
            // Ganhou pontos e XP
            await this.participantService.addXp(game.chatId, userId, 50 * game.currentQuestionIndex);
            await this.participantService.addScore(game.chatId, userId, 100 * game.currentQuestionIndex);

            // Recompensas progressivas (Show do Milhão) - Começando com 500
            // Q1 = 500, Q2 = 1000, Q3 = 2000, Q4 = 3000, Q5 = 5000
            // Q6 = 10000, Q7 = 20000, Q8 = 30000, Q9 = 40000, Q10 = 50000
            // Q11 = 100000, Q12 = 200000, Q13 = 300000, Q14 = 400000, Q15 = 500000
            // Q16 = 1000000
            const prizeTable = [0, 500, 1000, 2000, 3000, 5000, 10000, 20000, 30000, 40000, 50000, 100000, 200000, 300000, 400000, 500000, 1000000];
            game.accumulatedPrize = prizeTable[game.currentQuestionIndex] || 1000000;

            if (game.currentQuestionIndex >= 16) {
                game.status = 'finished';
                gameOver = true;
            } else {
                game.status = 'playing';
            }
        } else {
            // Errou
            await this.participantService.addXp(game.chatId, userId, -25);
            await this.participantService.addScore(game.chatId, userId, -50);

            // Verifica eliminação
            const participant = await this.participantService.getParticipantFromGroup(game.chatId, userId);
            if (participant && (participant.xp <= 0 && participant.score <= 0)) {
                // Participante eliminado do jogo atual (remover da lista se for grupo)
                if (game.mode === 'group') {
                    game.participants = game.participants.filter(id => id !== userId);
                    if (game.participants.length === 0) {
                        game.status = 'finished';
                        gameOver = true;
                    }
                } else {
                    game.status = 'finished';
                    gameOver = true;
                }
            } else if (game.mode === 'private') {
                // No modo PV, um erro geralmente termina o jogo (Show do Milhão clássico)
                game.status = 'finished';
                gameOver = true;
            }
        }

        if (gameOver) {
            this.activeGames.delete(chatId);
        }

        return { correct: isCorrect, gameOver, game };
    }

    public async useHelp(chatId: string, type: GameHelpType): Promise<GameHelpResponse> {
        const game = this.activeGames.get(chatId);
        if (!game || !game.currentQuestion) throw new Error("Jogo ou pergunta não ativa.");

        if (type === 'pulos') {
            if (game.helped.pulos <= 0) throw new Error("Você não tem mais pulos.");
            game.helped.pulos--;
            await this.nextQuestion(chatId);
            return { type: 'pulos', content: "Pergunta pulada com sucesso!" };
        }

        if (type === 'cartas') {
            if (!game.helped.cartas) throw new Error("Você já usou as cartas.");
            game.helped.cartas = false;
            const cards = [0, 1, 2, 3];
            const chosen = cards[Math.floor(Math.random() * cards.length)];
            const wrongOptions = [];
            for (let i = 0; i < 4; i++) {
                if (i !== game.currentQuestion.answer) wrongOptions.push(i);
            }
            // Shuffle wrong options
            wrongOptions.sort(() => Math.random() - 0.5);
            const removed = wrongOptions.slice(0, chosen);
            return { type: 'cartas', content: `Você tirou o ${chosen === 0 ? 'Rei (nada removido)' : chosen}. Removendo ${chosen} opção(ões) errada(s).`, optionsRemoved: removed };
        }

        if (type === 'universitarios') {
            if (!game.helped.universitarios) throw new Error("Você já usou os universitários.");
            game.helped.universitarios = false;
            const opinions = [];
            for (let i = 0; i < 3; i++) {
                const isRight = Math.random() > 0.3; // 70% chance of being right
                opinions.push(isRight ? game.currentQuestion.options[game.currentQuestion.answer] : game.currentQuestion.options[Math.floor(Math.random() * 4)]);
            }
            return { type: 'universitarios', content: `Os universitários opinam: \n1. ${opinions[0]}\n2. ${opinions[1]}\n3. ${opinions[2]}` };
        }

        if (type === 'placas') { // Alex AI
            if (!game.helped.placas) throw new Error("Você já usou a ajuda do Alex.");
            game.helped.placas = false;
            const isRight = Math.random() > 0.1; // 90% chance of being right (it's an AI after all)
            const advice = isRight ? game.currentQuestion.options[game.currentQuestion.answer] : game.currentQuestion.options[Math.floor(Math.random() * 4)];
            return { type: 'placas', content: `*Alex AI:* Analisando as probabilidades, acredito que a resposta correta seja: *${advice}*` };
        }

        throw new Error("Tipo de ajuda inválido.");
    }

    public stopGame(chatId: string): number {
        const game = this.activeGames.get(chatId);
        if (!game) throw new Error("Jogo não encontrado.");

        const reward = game.accumulatedPrize; // O usuário pediu: "ganha o que tinha adquirido"
        this.activeGames.delete(chatId);
        return reward;
    }

    public expireGame(chatId: string): GameState | undefined {
        const game = this.activeGames.get(chatId);
        if (game) {
            this.activeGames.delete(chatId);
            return game;
        }
        return undefined;
    }
}
