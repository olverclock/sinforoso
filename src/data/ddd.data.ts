/*
 * DDDs do Brasil por estado (Plano de Numeração da Anatel: 67 códigos de área, 11 a 99).
 * Dados locais: o !ddd não depende mais de um arquivo externo baixado a cada uso.
 * Observação: o 61 também atende parte de Goiás (entorno do DF); aqui ele aparece como Distrito Federal.
 */

export interface DddState { state: string, region: string, ddds: string[] }

export const DDD_STATES: DddState[] = [
    { state: "Acre", region: "Norte", ddds: ["68"] },
    { state: "Alagoas", region: "Nordeste", ddds: ["82"] },
    { state: "Amapá", region: "Norte", ddds: ["96"] },
    { state: "Amazonas", region: "Norte", ddds: ["92", "97"] },
    { state: "Bahia", region: "Nordeste", ddds: ["71", "73", "74", "75", "77"] },
    { state: "Ceará", region: "Nordeste", ddds: ["85", "88"] },
    { state: "Distrito Federal", region: "Centro-Oeste", ddds: ["61"] },
    { state: "Espírito Santo", region: "Sudeste", ddds: ["27", "28"] },
    { state: "Goiás", region: "Centro-Oeste", ddds: ["62", "64"] },
    { state: "Maranhão", region: "Nordeste", ddds: ["98", "99"] },
    { state: "Mato Grosso", region: "Centro-Oeste", ddds: ["65", "66"] },
    { state: "Mato Grosso do Sul", region: "Centro-Oeste", ddds: ["67"] },
    { state: "Minas Gerais", region: "Sudeste", ddds: ["31", "32", "33", "34", "35", "37", "38"] },
    { state: "Pará", region: "Norte", ddds: ["91", "93", "94"] },
    { state: "Paraíba", region: "Nordeste", ddds: ["83"] },
    { state: "Paraná", region: "Sul", ddds: ["41", "42", "43", "44", "45", "46"] },
    { state: "Pernambuco", region: "Nordeste", ddds: ["81", "87"] },
    { state: "Piauí", region: "Nordeste", ddds: ["86", "89"] },
    { state: "Rio de Janeiro", region: "Sudeste", ddds: ["21", "22", "24"] },
    { state: "Rio Grande do Norte", region: "Nordeste", ddds: ["84"] },
    { state: "Rio Grande do Sul", region: "Sul", ddds: ["51", "53", "54", "55"] },
    { state: "Rondônia", region: "Norte", ddds: ["69"] },
    { state: "Roraima", region: "Norte", ddds: ["95"] },
    { state: "Santa Catarina", region: "Sul", ddds: ["47", "48", "49"] },
    { state: "São Paulo", region: "Sudeste", ddds: ["11", "12", "13", "14", "15", "16", "17", "18", "19"] },
    { state: "Sergipe", region: "Nordeste", ddds: ["79"] },
    { state: "Tocantins", region: "Norte", ddds: ["63"] },
]
