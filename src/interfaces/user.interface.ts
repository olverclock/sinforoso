export interface User {
    id: string,
    name?: string | null,
    commands: number,
    receivedWelcome: boolean,
    owner: boolean,
    admin: boolean,
    command_rate: UserCommandRate,
    fortnite_nick?: string,
    free_games_sub?: boolean,
    free_games_mode?: "resumido" | "completo",
    // Card Game Economy
    xp?: number,
    daily_rolls?: DailyRolls,
    cards_collected?: number,
    // Weekly Streak Tracking
    roll_streak?: number, // Consecutive days with at least one roll
    last_roll_date?: string // YYYY-MM-DD - last day user rolled
}

export interface DailyRolls {
    count: number,
    reset_date: string // YYYY-MM-DD
}

export interface UserCommandRate {
    limited: boolean,
    expire_limited: number,
    cmds: number,
    expire_cmds: number
}

