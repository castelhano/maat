import { notFound } from "next/navigation";
import { requirePermissao } from "@/lib/session";
import { ImprimirButton } from "@/app/admin/banco-horas/extrato-pdf/imprimir-button";
import { buscarTermoConsignado } from "../consignado-actions";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const moeda = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCpf = (c: string) => c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const fmtCnpj = (c: string) => c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

// Termo de ciência do limite de desconto do e-Consignado, preenchido com os valores do mês para o
// colaborador assinar.
export default async function TermoConsignadoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresaId?: string; competencia?: string; cpf?: string }>;
}) {
  await requirePermissao("folha", "consultar");
  const { empresaId, competencia, cpf } = await searchParams;
  if (!empresaId || !competencia || !cpf) notFound();
  const dados = await buscarTermoConsignado(empresaId, competencia, cpf);
  if (!dados) notFound();

  const { linha } = dados;
  const disponivel = linha.remuneracaoBruta - linha.inss - linha.ir - linha.pensao;
  const semRemuneracao = linha.situacao === "sem_remuneracao";
  // Desconto de cada contrato conforme os eventos de consignado da folha (um evento por contrato).
  const contratos = linha.contratos.map((c) => {
    const descontado = linha.descontoPorContrato[c.contrato] ?? 0;
    return { ...c, descontado, naoDescontado: Math.round((c.valorParcela - descontado) * 100) / 100 };
  });
  const hoje = new Date();
  const dataExtenso = `${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`;
  const linhaAssinatura = "border-t border-neutral-500 pt-1 text-xs";

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-white px-8 py-10 text-[13px] leading-relaxed text-neutral-900 print:px-0 print:py-0">
      <ImprimirButton />

      <h1 className="mb-1 text-center text-base font-bold uppercase">Termo de Ciência</h1>
      <p className="mb-6 text-center text-xs font-semibold uppercase">Limite de desconto do Crédito do Trabalhador (e-Consignado)</p>

      <table className="mb-6 w-full border-collapse text-xs">
        <tbody>
          {[
            ["Empresa", dados.razaoSocial],
            ["CNPJ", fmtCnpj(dados.cnpj)],
            ["Colaborador(a)", linha.nome],
            ["Matrícula", linha.matricula ?? "—"],
            ["CPF", fmtCpf(dados.cpf)],
            ["Função", dados.funcao || "—"],
            ["Competência da folha", competencia],
          ].map(([rotulo, valor]) => (
            <tr key={rotulo} className="border border-neutral-300">
              <td className="w-48 bg-neutral-100 px-2 py-1 font-semibold">{rotulo}</td>
              <td className="px-2 py-1">{valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mb-3">
        Na competência {competencia}, as parcelas de empréstimo consignado (Crédito do Trabalhador / e-Consignado) informadas pelas
        instituições financeiras{" "}
        {semRemuneracao
          ? "não puderam ser descontadas em folha, pois não houve remuneração no mês"
          : "ultrapassaram o limite que a empresa pode descontar em folha"}
        .
      </p>
      <p className="mb-4">
        Conforme o <strong>art. 1º, § 1º, da Lei nº 10.820/2003</strong> e o <strong>art. 30 da Portaria MTE nº 435/2025</strong>, que
        regulamentam o crédito consignado do trabalhador, a soma dos descontos das parcelas não pode ultrapassar{" "}
        <strong>35% da remuneração disponível</strong> — a soma dos vencimentos com incidência de contribuição previdenciária, descontados o
        INSS, o Imposto de Renda retido na fonte e os demais descontos obrigatórios. Por isso, a empresa descontou somente até esse limite
        e, como determina o § 4º do mesmo art. 30, informa ao(à) colaborador(a) o desconto parcial ou não realizado.
      </p>

      <table className="mb-6 w-full border-collapse text-xs">
        <tbody>
          {[
            ["Vencimentos com incidência de INSS", linha.remuneracaoBruta],
            ["(−) INSS", linha.inss],
            ["(−) Imposto de Renda", linha.ir],
            ...(linha.pensao ? [["(−) Pensão alimentícia", linha.pensao]] : []),
            ["(=) Remuneração disponível", disponivel],
            ["Limite de 35% para consignado", linha.limite ?? 0],
            ["Total das parcelas informadas pelos bancos", linha.previsto],
            ["Total descontado em folha", linha.descontado],
          ].map(([rotulo, valor]) => (
            <tr key={rotulo as string} className="border border-neutral-300">
              <td className="px-2 py-1">{rotulo}</td>
              <td className="w-32 px-2 py-1 text-right tabular-nums">{moeda(valor as number)}</td>
            </tr>
          ))}
          <tr className="border border-neutral-300 bg-neutral-100 font-bold">
            <td className="px-2 py-1">Valor não descontado</td>
            <td className="px-2 py-1 text-right tabular-nums">{moeda(linha.naoDescontado)}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-2 text-xs font-bold uppercase">Contratos e valores do mês</h2>
      <table className="mb-6 w-full border-collapse text-xs">
        <thead>
          <tr className="border border-neutral-300 bg-neutral-100 text-left">
            <th className="px-2 py-1">Instituição financeira</th>
            <th className="px-2 py-1">Contrato</th>
            <th className="px-2 py-1 text-right">Parcela</th>
            <th className="px-2 py-1 text-right">Descontado</th>
            <th className="px-2 py-1 text-right">Não descontado</th>
          </tr>
        </thead>
        <tbody>
          {contratos.map((c) => (
            <tr key={c.contrato} className="border border-neutral-300">
              <td className="px-2 py-1">{c.banco}</td>
              <td className="px-2 py-1">{c.contrato}</td>
              <td className="px-2 py-1 text-right tabular-nums">{moeda(c.valorParcela)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{moeda(c.descontado)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{moeda(c.naoDescontado)}</td>
            </tr>
          ))}
          <tr className="border border-neutral-300 font-bold">
            <td className="px-2 py-1" colSpan={2}>
              Total
            </td>
            <td className="px-2 py-1 text-right tabular-nums">{moeda(linha.previsto)}</td>
            <td className="px-2 py-1 text-right tabular-nums">{moeda(linha.descontado)}</td>
            <td className="px-2 py-1 text-right tabular-nums">{moeda(linha.naoDescontado)}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-2 text-xs font-bold uppercase">Orientação ao colaborador</h2>
      <ol className="mb-6 list-decimal space-y-1 pl-5">
        <li>O valor não descontado continua devido à instituição financeira e deve ser regularizado diretamente com ela.</li>
        <li>
          Procure o(s) banco(s) acima para combinar a forma de pagamento da diferença ou renegociar o contrato (por exemplo, prazo maior e
          parcela menor).
        </li>
        <li>
          A empresa apenas repassa o que é descontado em folha e não pode descontar acima do limite legal. A empresa não é responsável pelo
          valor que ficou sem desconto nem por juros ou encargos cobrados pelo banco por esse motivo.
        </li>
        <li>
          Enquanto as parcelas somadas ficarem acima do limite, a situação pode se repetir nos próximos meses. Antes de contratar novos
          empréstimos, confira a margem disponível.
        </li>
      </ol>

      <h2 className="mb-2 text-xs font-bold uppercase">Declaração de ciência</h2>
      <p className="mb-6">
        Eu, {linha.nome}, declaro que fui informado(a) de que as parcelas de empréstimo consignado da competência {competencia}{" "}
        {semRemuneracao
          ? "não puderam ser descontadas por falta de remuneração no mês"
          : "ultrapassaram o limite legal de 35% da minha remuneração disponível"}
        . Estou ciente de que o valor de R$ {moeda(linha.naoDescontado)} não foi descontado em folha e de que devo regularizá-lo diretamente
        com a(s) instituição(ões) financeira(s).
      </p>
      <p className="mb-12">Cuiabá, {dataExtenso}.</p>

      <div className="grid grid-cols-2 gap-x-10 gap-y-14">
        <div className={linhaAssinatura}>
          Colaborador(a): {linha.nome}
          <br />
          CPF {fmtCpf(dados.cpf)}
        </div>
        <div className={linhaAssinatura}>Empresa (Departamento Pessoal)</div>
        <div className={linhaAssinatura}>Testemunha 1 — Nome / CPF</div>
        <div className={linhaAssinatura}>Testemunha 2 — Nome / CPF</div>
      </div>
    </div>
  );
}
