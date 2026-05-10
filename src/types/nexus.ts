export type NexusModelo = {
  id: number;
  data_contrato: string;
  data_cancelamento?: string;
  valor: number;
  percentual_retencao?: number;
  royalties?: number;
  crm?: number;
  status: string;
  modelo_nome?: string;
  anos_contrato?: number;
  unidade: {
    nome: string;
    cidade: string;
    uf: string;
    raw_data?: Record<string, unknown>;
  };
  consultor: {
    nome: string;
  };
  raw_data?: Record<string, unknown>;
};
