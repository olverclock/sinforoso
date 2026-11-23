/*
 * Tabela de símbolos para nicks e mensagens (!tabela). Conteúdo próprio e local: antes o texto era
 * baixado de um arquivo externo a cada uso. Só caracteres Unicode comuns, que aparecem no WhatsApp.
 */

const SECTIONS: [string, string][] = [
    ["⭐ Estrelas e brilhos", "★ ☆ ✦ ✧ ✩ ✪ ✫ ✬ ✭ ✮ ✯ ✰ ⁂ ⁎ ⁑ ✱ ✲ ✳ ✴ ✵ ✶ ✷ ✸ ✹ ✺ ✻ ✼ ✽ ❂ ❉ ❊ ❋ ✨"],
    ["❤️ Corações", "♡ ♥ ❣ ❤ ❥ ❦ ❧ ღ ɞ ʚ ♡̷ ❤︎"],
    ["🌸 Flores e natureza", "✿ ❀ ❁ ❃ ❋ ✾ ⚘ ☘ ❦ ❧ ☙ ✤ ✥ ❖ ☼ ☀ ☁ ☂ ☃ ☾ ☽ ✧ ϟ"],
    ["👑 Coroas e xadrez", "♔ ♕ ♖ ♗ ♘ ♙ ♚ ♛ ♜ ♝ ♞ ♟ ♤ ♠ ♧ ♣ ♢ ♦"],
    ["✝️ Cruzes e místicos", "✝ ✞ ✟ ✠ ☥ ☦ ☧ ☨ ☩ ☪ ☫ ☬ ☯ ☸ ⚚ ⚕ ⚜ ⚝ ⛧ ⛤ ۞ ۝ ༒ ࿇ ࿈"],
    ["➤ Setas", "← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙ ⇐ ⇑ ⇒ ⇓ ⇔ ➔ ➜ ➝ ➞ ➟ ➠ ➡ ➢ ➣ ➤ ➥ ➦ ➧ ➨ ➩ ➪ ➫ ➬ ➭ ➮ ➯ ➱ ➲ ➳ ➴ ➵ ➶ ➷ ➸ ➹ ➺ ➻ ➼ ➽ ⟵ ⟶"],
    ["◆ Formas", "■ □ ▢ ▣ ▤ ▥ ▦ ▧ ▨ ▩ ▪ ▫ ▬ ▭ ▮ ▯ ▰ ▱ ▲ △ ▴ ▵ ▶ ▷ ▸ ▹ ► ▻ ▼ ▽ ▾ ▿ ◀ ◁ ◂ ◃ ◄ ◅ ◆ ◇ ◈ ◉ ◊ ○ ◌ ◍ ◎ ● ◐ ◑ ◒ ◓ ◔ ◕ ◖ ◗ ░ ▒ ▓ █"],
    ["『 Molduras e colchetes", "『 』 「 」 【 】 〖 〗 〔 〕 《 》 〈 〉 ⟦ ⟧ ⟨ ⟩ ⦃ ⦄ ⦅ ⦆ ꧁ ꧂ ⊰ ⊱ ⫷ ⫸ ⌜ ⌝ ⌞ ⌟"],
    ["♪ Música e jogos", "♩ ♪ ♫ ♬ ♭ ♮ ♯ ⚀ ⚁ ⚂ ⚃ ⚄ ⚅ ⚽ ⚾ ⛳ ♨ ☕"],
    ["✓ Marcas e sinais", "✓ ✔ ✕ ✖ ✗ ✘ ☐ ☑ ☒ ⊕ ⊖ ⊗ ⊘ ⊙ ⊚ ⊛ ∞ ≈ ≠ ≤ ≥ ± ÷ × √ ∑ ∆ ∅ ⚠ ⚡ ☢ ☣ ⌛ ⏳ ✉ ✂ ✎ ✐ ✏"],
    ["˚ Detalhes para nick", "˚ ˖ ⁺ ₊ ⋆ ⊹ ⋅ ∘ ° • ◦ ‣ ⁃ ⦁ ⦾ ⦿ ⨳ ꒰ ꒱ ᵕ̈ ˘ ﹏ ︵ ︶ ⌒ ‿ ⁀ ⁔ ツ シ ッ"],
]

export const SYMBOLS_TABLE = `SÍMBOLOS 🔥\n\n` + SECTIONS.map(([title, chars]) => `*${title}*\n${chars}`).join('\n\n') +
    `\n\n_Toque e segure num símbolo para copiar._`
