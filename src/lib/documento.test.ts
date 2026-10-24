import { describe, expect, it } from "vitest";
import { documentoValido, formatCep, formatDocumento, formatTelefone, tipoDocumento } from "./documento";

describe("documento", () => {
  it("aplica máscara progressiva de CPF e CNPJ", () => {
    expect(formatDocumento("529982")).toBe("529.982");
    expect(formatDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(tipoDocumento("112223330001")).toBe("CNPJ");
  });

  it("valida dígitos verificadores", () => {
    expect(documentoValido("529.982.247-25")).toBe("52998224725");
    expect(documentoValido("529.982.247-24")).toBeNull();
    expect(documentoValido("111.111.111-11")).toBeNull();
    expect(documentoValido("11.222.333/0001-81")).toBe("11222333000181");
    expect(documentoValido("11.222.333/0001-82")).toBeNull();
    expect(documentoValido("123")).toBeNull();
  });

  it("formata CEP e telefone", () => {
    expect(formatCep("79002000")).toBe("79002-000");
    expect(formatTelefone("6733334444")).toBe("(67) 3333-4444");
    expect(formatTelefone("67999998888")).toBe("(67) 99999-8888");
  });
});
