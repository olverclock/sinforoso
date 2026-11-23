export interface Question {
    id: number;
    question: string;
    options: string[];
    answer: number; // 0-3 index
    level: 'Fácil' | 'Médio' | 'Difícil';
}

export interface GameState {
    chatId: string;
    mode: 'private' | 'group';
    participants: string[]; // JIDs of people who can answer (private = 1, group = many)
    currentQuestionIndex: number;
    currentQuestion?: Question;
    helped: {
        pulos: number;
        cartas: boolean;
        universitarios: boolean;
        placas: boolean; // Alex AI
    };
    usedQuestionIds: number[];
    accumulatedPrize: number;
    status: 'starting' | 'playing' | 'waiting_answer' | 'finished';
    lastTime: number;
}

/** Tipos de ajuda do Show do Milhão. */
export type GameHelpType = 'pulos' | 'cartas' | 'universitarios' | 'placas'

export interface GameHelpResponse {
    type: 'pulos' | 'cartas' | 'universitarios' | 'placas';
    content: string;
    optionsRemoved?: number[];
}
