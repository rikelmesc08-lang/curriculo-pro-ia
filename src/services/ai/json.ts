/**
 * Recorte do JSON na resposta do modelo.
 *
 * Fica fora dos arquivos de provedor porque TODO provedor precisa da mesma
 * tolerância: mesmo instruído a responder só com JSON — e mesmo com o
 * `responseMimeType` do Gemini pedindo JSON — o modelo às vezes embrulha em
 * ```json ... ``` ou emenda uma frase antes. Recortar do primeiro `{` até o
 * último `}` cobre os dois casos sem depender de o modelo obedecer.
 */

export function extractJson(raw: string): unknown {
  const withoutFence = raw.replace(/```(?:json)?/gi, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
}
