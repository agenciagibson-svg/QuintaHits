import type { Metadata } from "next";
import Link from "next/link";
import { instagramUrl, site } from "@/config/site";
import { cnpjValido } from "@/lib/cnpj";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: `Como a ${site.nome} (${site.empresa}) trata os dados de quem reserva mesa e conversa com a gente no site e no WhatsApp, e como exercer os seus direitos pela LGPD.`,
  alternates: { canonical: "/privacidade" },
};

const p = site.privacidade;
// Defesa: um CNPJ malformado nunca é exibido (o teste também barra no repositório).
const cnpj = p.cnpj && cnpjValido(p.cnpj) ? p.cnpj : "";

/**
 * Política de Privacidade (LGPD). Descreve o que o sistema realmente faz hoje: reserva pelo site, atendimento
 * pelo WhatsApp (Cloud API da Meta), hospedagem e serviços de terceiros. Se algo do sistema mudar (nova ferramenta,
 * novo prazo de guarda, novo canal), esta página precisa mudar junto.
 * Dados da empresa (razão social, CNPJ, e-mail de privacidade) vêm de `site.privacidade` e só aparecem se preenchidos.
 */
export default function Privacidade() {
  return (
    <section className="secao secao--creme">
      <div className="wrap">
        <div className="eyebrow">Privacidade</div>
        <h1 className="display h-2" style={{ margin: "6px 0 8px" }}>Política de Privacidade</h1>
        <p className="muted">Última atualização: {p.atualizadaEm}</p>

        <div className="prosa">
          <p>
            Esta política explica, de forma simples, quais dados pessoais a <strong>{site.nome}</strong> trata quando você
            reserva uma mesa, conversa com a gente pelo WhatsApp ou navega neste site, para que serve cada dado, por quanto
            tempo o guardamos e como você pode exercer os seus direitos, conforme a Lei Geral de Proteção de Dados
            (Lei nº 13.709/2018, a LGPD).
          </p>

          <h2>1. Quem é o responsável</h2>
          <p>
            A {site.nome} é uma label da <strong>{site.empresa}</strong>
            {p.razaoSocial ? ` (${p.razaoSocial})` : ""}
            {cnpj ? `, CNPJ ${cnpj}` : ""}, e acontece toda quinta-feira no {site.casa.nome}, em {site.cidade}/{site.uf}.
            A {site.empresa} é a controladora dos dados tratados por este site e pelo atendimento de reservas.
            {p.endereco ? ` Endereço: ${p.endereco}.` : ""} Não há encarregado de dados designado: os pedidos de privacidade são atendidos pelo contato da seção 12.
          </p>

          <h2>2. Quais dados tratamos e para quê</h2>
          <table className="prosa__tabela">
            <thead>
              <tr><th>Situação</th><th>Dados</th><th>Para quê</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Pedido de reserva pelo site</td>
                <td>Nome, número de WhatsApp, quantidade de pessoas, mesa e data escolhidas</td>
                <td>Registrar o pedido, segurar a mesa e confirmar a reserva pelo WhatsApp</td>
              </tr>
              <tr>
                <td>Conversa pelo WhatsApp</td>
                <td>Número de telefone, nome do perfil, o conteúdo das mensagens e os dados da reserva (nome, pessoas, mesa e observações)</td>
                <td>Atender você, fazer, consultar, alterar ou cancelar reservas e tirar dúvidas</td>
              </tr>
              <tr>
                <td>Navegação e segurança</td>
                <td>Endereço IP, tipo de navegador e registros técnicos de acesso</td>
                <td>Manter o site no ar, impedir robôs e abusos (verificação &quot;não sou robô&quot;) e investigar falhas</td>
              </tr>
            </tbody>
          </table>
          <p>
            Não pedimos dados sensíveis (como saúde, religião ou opinião política). Se você escrever algo desse tipo no
            campo de observações, por exemplo uma restrição alimentar, usaremos apenas para atender o seu pedido.
            Pedimos que informe só o necessário.
          </p>

          <h2>3. Em que situações a lei nos permite tratar os dados</h2>
          <ul>
            <li><strong>Execução do que você pediu:</strong> fazer, confirmar, alterar ou cancelar uma reserva.</li>
            <li><strong>Legítimo interesse:</strong> segurança do site, prevenção a fraudes e abusos e melhoria do atendimento.</li>
            <li><strong>Obrigação legal ou exercício de direitos:</strong> quando a lei exigir a guarda de algum registro.</li>
            <li><strong>Consentimento:</strong> sempre que precisarmos dele para algo além disso. Não enviamos divulgação em massa sem o seu consentimento.</li>
          </ul>

          <h2>4. Atendimento automático e atendimento humano</h2>
          <p>
            As conversas pelo WhatsApp poderão ser atendidas por um assistente automático, que funciona com menus e regras
            definidas pela equipe (sem inteligência artificial generativa) e só oferece o que estiver cadastrado como disponível.
            Quando o assunto fugir do previsto, ou quando você pedir, a conversa passará para uma pessoa da equipe:
            com o assistente em funcionamento, basta escrever &quot;atendente&quot;. Enquanto ele não estiver ativo, o
            WhatsApp serve apenas para confirmar as reservas feitas pelo site, com o código que você recebe ao reservar.
          </p>

          <h2>5. Com quem compartilhamos</h2>
          <p>Não vendemos os seus dados. Usamos empresas que prestam serviços técnicos para o funcionamento do site e do atendimento:</p>
          <ul>
            <li><strong>Meta (WhatsApp Business / Cloud API):</strong> envio e recebimento das mensagens do WhatsApp.</li>
            <li><strong>Supabase:</strong> banco de dados onde ficam as reservas e o histórico de atendimento.</li>
            <li><strong>Vercel:</strong> hospedagem do site.</li>
            <li><strong>Cloudflare (Turnstile):</strong> verificação &quot;não sou robô&quot; no formulário de reserva.</li>
            <li><strong>Google Fonts e Spotify:</strong> as fontes de letra e o player de música do site são carregados desses serviços, que recebem dados técnicos do seu navegador, como o endereço IP.</li>
          </ul>
          <p>
            Também podemos compartilhar dados com autoridades quando a lei exigir. Dentro da {site.empresa}, o acesso é
            restrito à equipe que precisa deles para atender reservas.
          </p>

          <h2>6. Transferência para outros países</h2>
          <p>
            Alguns desses serviços podem armazenar ou processar dados fora do Brasil. Nesses casos, buscamos fornecedores
            que adotam medidas de proteção compatíveis com a LGPD.
          </p>

          <h2>7. Por quanto tempo guardamos</h2>
          <table className="prosa__tabela">
            <thead>
              <tr><th>Dado</th><th>Prazo</th></tr>
            </thead>
            <tbody>
              <tr><td>Texto das mensagens do WhatsApp</td><td>90 dias</td></tr>
              <tr><td>Registros técnicos e status de entrega das mensagens</td><td>12 meses</td></tr>
              <tr><td>Detalhes de erros técnicos</td><td>90 dias</td></tr>
              <tr><td>Eventos técnicos de controle do WhatsApp</td><td>30 dias</td></tr>
              <tr><td>Conversas encerradas (dados do contato)</td><td>anonimizados após 12 meses</td></tr>
              <tr><td>Reservas (nome e WhatsApp)</td><td>anonimizados após 24 meses; ficam só dados estatísticos, sem identificar você</td></tr>
            </tbody>
          </table>
          <p>
            Esses são os prazos que adotamos como regra para os dados de reserva e de atendimento. A rotina automática de limpeza
            ainda está em implantação; até ela entrar em funcionamento, você pode pedir a exclusão dos seus dados a qualquer
            momento (veja a seção 8). Podemos guardar por mais tempo apenas o que a lei exigir ou o que for necessário para
            nos defendermos em processos. Ao fim dos prazos, os dados são apagados ou anonimizados.
          </p>

          <h2>8. Seus direitos</h2>
          <p>Você pode pedir, a qualquer momento e sem custo:</p>
          <ul>
            <li>confirmação de que tratamos dados seus e acesso a eles;</li>
            <li>correção de dados incompletos, incorretos ou desatualizados;</li>
            <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;</li>
            <li>portabilidade dos dados, quando aplicável;</li>
            <li>eliminação dos dados tratados com o seu consentimento e informação sobre com quem os compartilhamos;</li>
            <li>revogação do consentimento, quando o tratamento depender dele.</li>
          </ul>
          <p>
            Para exercer qualquer direito, fale com a gente
            {p.emailContato ? <> pelo e-mail <a href={`mailto:${p.emailContato}`}>{p.emailContato}</a> ou</> : null} pelo
            Instagram <a href={instagramUrl(site.instagram)} target="_blank" rel="noopener noreferrer">@{site.instagram}</a>.
            Por segurança, podemos pedir informações para confirmar que o pedido é seu. Se você pedir a exclusão dos seus
            dados, apagamos ou anonimizamos o que a lei permitir e avisamos você.
          </p>
          <p>
            Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD) se entender que o tratamento
            não respeita a lei.
          </p>

          <h2>9. Como protegemos os dados</h2>
          <p>
            Usamos conexão segura (HTTPS), acesso restrito ao banco de dados apenas pelo sistema, controle de acesso ao
            painel da equipe, registro de alterações de configuração e de atendimento e verificação anti-abuso no formulário. Nenhum sistema é
            totalmente livre de riscos; em caso de incidente que possa afetar você, comunicaremos conforme a lei.
          </p>

          <h2>10. Cookies e conteúdos de terceiros</h2>
          <p>
            Este site não usa cookies de publicidade nem de análise de audiência. A equipe usa um cookie de sessão para
            entrar no painel administrativo. Os serviços incorporados (verificação &quot;não sou robô&quot; e player do Spotify)
            podem definir cookies próprios, regidos pelas políticas de cada empresa. Se passarmos a usar ferramentas de
            medição, atualizaremos esta página antes.
          </p>

          <h2>11. Mudanças nesta política</h2>
          <p>
            Podemos atualizar esta página para refletir mudanças no site ou na lei. A data da última atualização está no
            início do texto.
          </p>

          <h2>12. Contato</h2>
          <p>
            {site.nome} · {site.empresa}{p.razaoSocial ? ` (${p.razaoSocial})` : ""} · {p.endereco || `${site.cidade}/${site.uf}`}
            {p.emailContato ? <> · <a href={`mailto:${p.emailContato}`}>{p.emailContato}</a></> : null}
            {" · "}
            <a href={instagramUrl(site.instagram)} target="_blank" rel="noopener noreferrer">@{site.instagram}</a>
          </p>
        </div>

        <p style={{ marginTop: 40 }}>
          <Link className="btn btn--vazado btn--p" href="/">Voltar ao início</Link>
        </p>
      </div>
    </section>
  );
}
