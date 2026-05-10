-- Seed Data for system_settings table
-- Generated from legacy settings.json

INSERT INTO system_settings (key, value, description) VALUES
('nexus_model_map', '{
    "1": "Studio Fiscal",
    "2": "Studio Law",
    "3": "Studio Brokers",
    "4": "E-Fiscal",
    "5": "Braga & Monteiro",
    "6": "SF Braga",
    "7": "Studio Alimentos",
    "8": "Studio Collection",
    "9": "Studio Law II",
    "10": "SF Gonzalo",
    "11": "SF Claudio",
    "12": "E-Contabil",
    "13": "Studio Corporate",
    "14": "SCI",
    "15": "Audit Tecnologia",
    "16": "Studio Agro",
    "17": "Studio Energy",
    "18": "Economix",
    "19": "Spacew",
    "20": "Banana",
    "21": "Studio Assessoria Financeira",
    "22": "Studio Par",
    "23": "Studio Family Business",
    "24": "Studio Adm",
    "25": "Studio Log",
    "26": "Studio Grow",
    "27": "Studio Revisão Bancária",
    "28": "Studio X",
    "29": "GS Educação",
    "30": "Studio RH",
    "31": "Loja",
    "32": "Studio Bank",
    "33": "Studio Law Litigation",
    "34": "Exohub",
    "35": "Orb",
    "36": "EF Comercial",
    "37": "SF Comercial",
    "38": "SL Comercial",
    "39": "Studio Management",
    "40": "Studio Store",
    "41": "Studio Varejo",
    "42": "Studio Contabilidade",
    "43": "SBS Store"
}', 'Mapping of Nexus Model IDs to Names'),

('nexus_type_map', '{
    "1": "Franquia",
    "2": "Licença",
    "3": "Parceria"
}', 'Mapping of Nexus Type IDs to Names'),

('unidades_type_map', '{
    "1": "Franquia",
    "2": "TAX",
    "3": "Corporate",
    "4": "Segmento",
    "5": "Platinum",
    "6": "GS Partner",
    "7": "Flagship",
    "8": "JV",
    "9": "XP",
    "10": "BTG",
    "11": "Safra",
    "12": "Parceiros",
    "13": "NTW",
    "14": "Rede de Distribuição B2C",
    "15": "PAR",
    "16": "PJ360",
    "17": "Flagship"
}', 'Mapping of Unidades Type IDs to Names'),

('departamentos', '[
    "comercial",
    "operacional",
    "expansao",
    "franchising",
    "educacao",
    "tax",
    "corporate",
    "tecnologia",
    "financeiro"
]', 'List of active departments'),

('display_names', '{
    "diretoria": "Grupo Studio",
    "comercial": "Comercial",
    "operacional": "Operacional",
    "expansao": "Expansão",
    "franchising": "Franchising",
    "educacao": "Educação",
    "tax": "Tax",
    "corporate": "Corporate",
    "tecnologia": "Tecnologia",
    "financeiro": "Financeiro"
}', 'Mapping of internal names to display names')

ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
