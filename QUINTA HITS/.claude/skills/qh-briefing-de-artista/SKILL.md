---
name: qh-briefing-de-artista
description: Coleta padronizada de informações do artista da semana da QUINTA HITS e montagem do pacote de divulgação. Use ao confirmar a atração de uma quinta, ao pedir material para um artista ou ao preparar o briefing de arte e mídia da edição.
---

# Briefing de artista — QUINTA HITS

Objetivo: sair do "quem toca quinta?" para um pacote de divulgação completo, sem
nenhum campo preenchido por suposição.

## Ficha obrigatória

| Campo | Observação |
|---|---|
| Nome artístico | grafia exata, conferida com o artista |
| @ do Instagram | conferido abrindo o perfil, não de memória |
| Gênero musical | rock, pop rock, hits, anos 2000, MPB, DJ… |
| Formato do show | banda, voz e violão, duo, DJ set |
| Vínculo com a GIBSON PROMOÇÕES | sim / parceiro / não |
| Cidade base | público local de Uberlândia? |
| Repertório / referências | 3 a 5 artistas que dão a ideia da noite |
| Horário de início | vai no rodapé da arte |
| Material visual | foto em alta e vídeo vertical curto |
| Frase de posicionamento | uma linha do próprio artista |
| Cachê e condições | para o `qh-controller` |
| Restrições | o que não pode ser divulgado |

Cadastre em `DATABASE/csv/artistas.csv` e vincule à edição em `eventos_artistas.csv`.

## Checagem de encaixe

1. Sustenta boteco + música ao vivo + nightlife numa quinta? (não é balada nem festival)
2. Tem público em Uberlândia alcançável por mídia?
3. Entrega material a tempo (D-5)?
4. Sobreposição com edições recentes: reforça a recorrência ou canibaliza?
5. Cachê cabe no resultado esperado?

## Pacote de divulgação da edição

- [ ] Arte vertical 9:16 com **dia, horário, Florindos Bar e selo QH no rodapé**
- [ ] Vídeo curto com gancho nos primeiros 0,5s (selo + artista + "QUINTA")
- [ ] Legenda de programação (não institucional) com CTA único de reserva
- [ ] Texto primário e headline do anúncio, em 2–3 variantes
- [ ] Stories: anúncio, lembrete de véspera e "Hoje é quinta. Tem Quinta Hits."
- [ ] Link de reserva testado no celular
- [ ] Linhas criadas em `criativos.csv`, `conteudo_calendario.csv` e `campanhas.csv`

## Cuidados

- A comunicação institucional **não depende** do artista. O artista entra nas peças de
  programação e conversão; a marca segue igual.
- Não invente dado de artista (seguidores, cidade, repertório). Campo sem confirmação
  fica vazio, com a pendência anotada em `observacoes`.
- Nome da empresa em qualquer material: **GIBSON PROMOÇÕES**.
