import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TableOfContents,
  HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign,
  PageBreak, PageNumber
} from "docx";
import * as fs from "fs";

// Color Scheme: "Midnight Code" (Slate & Silver)
const colors = {
  primary: "020617",
  body: "1E293B",
  secondary: "64748B",
  accent: "94A3B8",
  tableBg: "F8FAFC",
  white: "FFFFFF",
  tableHeaderBg: "0F172A",
  tableHeaderText: "F8FAFC",
  tableAltRow: "F1F5F9",
  coverAccent: "334155",
  lightBorder: "CBD5E1",
};

const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: colors.lightBorder };
const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };

const LINE_SPACING = 276;

function bodyParagraph(text: string, opts: any = {}) {
  return new Paragraph({
    spacing: { after: 120, line: LINE_SPACING },
    alignment: AlignmentType.JUSTIFIED,
    ...opts,
    children: [
      new TextRun({ text, font: "Calibri", size: 22, color: colors.body }),
    ],
  });
}

function heading1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 600, after: 300, line: LINE_SPACING },
    children: [
      new TextRun({ text, font: "Times New Roman", size: 36, bold: true, color: colors.primary }),
    ],
  });
}

function heading2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200, line: LINE_SPACING },
    children: [
      new TextRun({ text, font: "Times New Roman", size: 28, bold: true, color: colors.body }),
    ],
  });
}

function heading3(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 300, after: 150, line: LINE_SPACING },
    children: [
      new TextRun({ text, font: "Times New Roman", size: 24, bold: true, color: colors.secondary }),
    ],
  });
}

function emptyLine(size = 100) {
  return new Paragraph({ spacing: { after: size }, children: [] });
}

function headerCell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: cellBorders,
    shading: { fill: colors.tableHeaderBg, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: LINE_SPACING },
        children: [
          new TextRun({ text, bold: true, font: "Calibri", size: 20, color: colors.tableHeaderText }),
        ],
      }),
    ],
  });
}

function dataCell(text: string, width: number, opts: { align?: any; bold?: boolean; color?: string; bg?: string } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: cellBorders,
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: opts.align || AlignmentType.CENTER,
        spacing: { line: LINE_SPACING },
        children: [
          new TextRun({ text, font: "Calibri", size: 20, color: opts.color || colors.body, bold: opts.bold }),
        ],
      }),
    ],
  });
}

function tableCaption(text: string) {
  return new Paragraph({
    spacing: { before: 80, after: 200, line: LINE_SPACING },
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text, font: "Calibri", size: 18, italics: true, color: colors.secondary }),
    ],
  });
}

function codeBlock(lines: string[]) {
  return lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 0, line: 240 },
        indent: { left: 360 },
        children: [
          new TextRun({ text: line, font: "Calibri", size: 18, color: colors.body }),
        ],
      })
  );
}

// Numbering config
const numberingConfig = {
  config: [
    {
      reference: "bullet-s5", levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: "bullet-s7", levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
  ],
};

function bulletItem(text: string, ref: string = "bullet-s5") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60, line: LINE_SPACING },
    children: [new TextRun({ text, font: "Calibri", size: 22, color: colors.body })],
  });
}

// ═══════════════════════════════════════════
// COVER PAGE SECTION
// ═══════════════════════════════════════════
const coverSection = {
  properties: {
    page: {
      margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      size: { width: 11906, height: 16838 },
    },
    titlePage: true,
  },
  children: [
    emptyLine(3600),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "V A L I F L O W   P R O",
          font: "Times New Roman",
          size: 72,
          bold: true,
          color: colors.primary,
          characterSpacing: 180,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
          font: "Calibri", size: 22, color: colors.accent,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: "Arquitectura Fusionada", font: "Times New Roman", size: 40, color: colors.body }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({ text: "Informe T\u00e9cnico v1.0", font: "Times New Roman", size: 32, color: colors.secondary }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Plataforma SaaS de Automatizaci\u00f3n de Ventas con IA Conversacional", font: "Calibri", size: 24, color: colors.secondary }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({ text: "Sector Automotriz Mexicano", font: "Calibri", size: 24, color: colors.secondary, italics: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({ text: "5 de Abril, 2026", font: "Calibri", size: 22, color: colors.coverAccent }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Confidencial \u2014 Documento Interno", font: "Calibri", size: 20, color: colors.accent, italics: true }),
      ],
    }),
  ],
};

// ═══════════════════════════════════════════
// TOC SECTION
// ═══════════════════════════════════════════
const headerDefault = new Header({
  children: [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: "ValiFlow Pro \u2014 Arquitectura Fusionada v1.0", font: "Calibri", size: 18, color: colors.accent, italics: true }),
      ],
    }),
  ],
});

const footerDefault = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "\u2014 ", font: "Calibri", size: 18, color: colors.secondary }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 18, color: colors.secondary }),
        new TextRun({ text: " \u2014", font: "Calibri", size: 18, color: colors.secondary }),
      ],
    }),
  ],
});

const tocSection = {
  properties: {
    page: { margin: { top: 1800, bottom: 1440, left: 1440, right: 1440 } },
  },
  headers: { default: headerDefault },
  footers: { default: footerDefault },
  children: [
    new Paragraph({
      spacing: { before: 200, after: 300 },
      children: [
        new TextRun({ text: "Tabla de Contenidos", font: "Times New Roman", size: 36, bold: true, color: colors.primary }),
      ],
    }),
    new TableOfContents("Tabla de Contenidos", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: "Nota: Esta Tabla de Contenidos se genera mediante c\u00f3digos de campo. Para asegurar la precisi\u00f3n de los n\u00fameros de p\u00e1gina despu\u00e9s de editar, haga clic derecho sobre la tabla y seleccione \u00abActualizar campo\u00bb.",
          font: "Calibri", size: 18, color: colors.accent, italics: true,
        }),
      ],
    }),
  ],
};

// ═══════════════════════════════════════════
// MAIN CONTENT
// ═══════════════════════════════════════════
const mainContent = {
  properties: {
    page: { margin: { top: 1800, bottom: 1440, left: 1440, right: 1440 }, pageNumbers: { start: 1 } },
  },
  headers: { default: headerDefault },
  footers: { default: footerDefault },
  children: [
    // ─── SECTION 1: Resumen Ejecutivo ───
    heading1("1. Resumen Ejecutivo"),

    bodyParagraph(
      "ValiFlow Pro es una plataforma SaaS de automatizaci\u00f3n de ventas para el sector automotriz mexicano, resultado de la fusi\u00f3n estrat\u00e9gica de dos proyectos complementarios: ValiFlow (una aplicaci\u00f3n comercial React + Supabase orientada a la gesti\u00f3n CRM) y PicoClaw (un framework de agentes de IA escrito en Go). Esta fusi\u00f3n combina la madurez comercial y la experiencia de usuario de ValiFlow con los patrones avanzados de inteligencia artificial conversacional de PicoClaw, reimplementados completamente en TypeScript para integraci\u00f3n nativa con el ecosistema Next.js."
    ),

    bodyParagraph(
      "La estrategia de fusi\u00f3n sigue un enfoque \u00abValiFlow-First\u00bb: la infraestructura comercial, el dashboard, la autenticaci\u00f3n y el CRM se heredan directamente de ValiFlow, mientras que los patrones de agentes de IA, el motor de ingresos (Revenue Engine) y el motor de cierre (Closing Engine) se reimplementan desde PicoClaw en TypeScript puro, aprovechando el SDK z-ai-web-dev-sdk para orquestaci\u00f3n multi-proveedor."
    ),

    heading2("Estado Actual del Proyecto"),

    bodyParagraph(
      "El proyecto se encuentra aproximadamente al 85% de completitud, con un dashboard completamente funcional que incluye 8 vistas principales: Dashboard ejecutivo, Bandeja de mensajes, Pipeline CRM, Contactos, Agentes IA, Anal\u00edticas, Automatizaciones y Configuraci\u00f3n. La infraestructura base est\u00e1 operativa con 20 modelos Prisma, 16 rutas API y soporte para 4 proveedores de IA."
    ),

    heading2("M\u00e9tricas Clave"),

    new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [4500, 4500],
      margins: { top: 100, bottom: 100, left: 180, right: 180 },
      rows: [
        new TableRow({ tableHeader: true, children: [headerCell("M\u00e9trica", 4500), headerCell("Valor", 4500)] }),
        new TableRow({ children: [dataCell("Modelos Prisma", 4500), dataCell("20+", 4500)] }),
        new TableRow({ children: [dataCell("Rutas API", 4500, { bg: colors.tableAltRow }), dataCell("16", 4500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Proveedores de IA", 4500), dataCell("4 (Groq, DeepSeek, Gemini, OpenAI)", 4500)] }),
        new TableRow({ children: [dataCell("Vistas del Dashboard", 4500, { bg: colors.tableAltRow }), dataCell("8", 4500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Contactos Seed", 4500), dataCell("20", 4500)] }),
        new TableRow({ children: [dataCell("Deals en Pipeline", 4500, { bg: colors.tableAltRow }), dataCell("12", 4500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Agentes IA", 4500), dataCell("3", 4500)] }),
        new TableRow({ children: [dataCell("Conversaciones Demo", 4500, { bg: colors.tableAltRow }), dataCell("15", 4500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Personalidad Principal", 4500), dataCell("JHON (Asesor Automotriz)", 4500)] }),
      ],
    }),
    tableCaption("Tabla 1.1 \u2014 M\u00e9tricas clave del proyecto ValiFlow Pro"),

    // ─── SECTION 2: Arquitectura Fusionada ───
    heading1("2. Arquitectura Fusionada"),

    heading2("2.1 Estrategia de Fusi\u00f3n"),

    bodyParagraph(
      "La arquitectura de ValiFlow Pro sigue la estrategia \u00abValiFlow-First\u00bb, donde el proyecto comercial existente (React + Supabase) sirve como base estructural y la l\u00f3gica de agentes de IA de PicoClaw se reimplementa en TypeScript nativo. Esta decisi\u00f3n elimina la complejidad de mantener dos lenguajes (Go + TypeScript) y permite una integraci\u00f3n fluida con el ecosistema Next.js 15."
    ),

    bodyParagraph(
      "El patr\u00f3n arquitect\u00f3nico se organiza en 6 capas horizontales que van desde la interfaz de usuario hasta la persistencia de datos, con una capa transversal de autenticaci\u00f3n y multi-tenancy:"
    ),

    heading3("Diagrama de Capas"),

    ...codeBlock([
      "\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
      "\u2502           Frontend (React + shadcn/ui)           \u2502",
      "\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524",
      "\u2502        API Layer (Next.js App Router)             \u2502",
      "\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524",
      "\u2502 AI Layer  \u2502  CRM    \u2502 Billing  \u2502 Channels  \u2502",
      "\u2502(PicoClaw)\u2502 Engine  \u2502(Stripe)  \u2502(WA/TG/IG) \u2502",
      "\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524",
      "\u2502       Data Layer (Prisma + PostgreSQL)           \u2502",
      "\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524",
      "\u2502   Auth + Multi-tenancy (NextAuth + RLS)          \u2502",
      "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518",
    ]),

    emptyLine(100),

    bodyParagraph(
      "La capa de Frontend utiliza React con la biblioteca shadcn/ui para componentes profesionales y Tailwind CSS 4 para estilizado. La capa API se implementa con Next.js App Router, proporcionando endpoints RESTful. Las capas de dominio (AI, CRM, Billing, Channels) operan de forma independiente pero comparten el acceso a datos a trav\u00e9s de Prisma ORM. La capa de datos soporta PostgreSQL en producci\u00f3n y SQLite para desarrollo local."
    ),

    heading2("2.2 Matriz de Decisi\u00f3n"),

    bodyParagraph(
      "La siguiente tabla detalla qu\u00e9 componentes se conservaron de cada proyecto original y las decisiones t\u00e9cnicas tomadas durante la fusi\u00f3n:"
    ),

    new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [2600, 2200, 2200, 2000],
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell("Componente", 2600), headerCell("Origen", 2200), headerCell("Decisi\u00f3n", 2200), headerCell("Notas", 2000),
        ]}),
        new TableRow({ children: [dataCell("Framework Frontend", 2600), dataCell("ValiFlow", 2200), dataCell("Conservado", 2200), dataCell("React + shadcn/ui", 2000)] }),
        new TableRow({ children: [dataCell("Framework Backend", 2600, { bg: colors.tableAltRow }), dataCell("ValiFlow", 2200, { bg: colors.tableAltRow }), dataCell("Conservado", 2200, { bg: colors.tableAltRow }), dataCell("Next.js App Router", 2000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("ORM / Base de Datos", 2600), dataCell("ValiFlow", 2200), dataCell("Adaptado", 2200), dataCell("Prisma (SQLite dev)", 2000)] }),
        new TableRow({ children: [dataCell("Autenticaci\u00f3n", 2600, { bg: colors.tableAltRow }), dataCell("ValiFlow", 2200, { bg: colors.tableAltRow }), dataCell("Conservado", 2200, { bg: colors.tableAltRow }), dataCell("NextAuth v4 + JWT", 2000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Agentes de IA", 2600), dataCell("PicoClaw", 2200), dataCell("Reimplementado", 2200), dataCell("Go \u2192 TypeScript", 2000)] }),
        new TableRow({ children: [dataCell("Revenue Engine", 2600, { bg: colors.tableAltRow }), dataCell("PicoClaw", 2200, { bg: colors.tableAltRow }), dataCell("Reimplementado", 2200, { bg: colors.tableAltRow }), dataCell("Pipeline 9 pasos", 2000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Closing Engine", 2600), dataCell("PicoClaw", 2200), dataCell("Reimplementado", 2200), dataCell("8 t\u00e9cnicas de cierre", 2000)] }),
        new TableRow({ children: [dataCell("Personalidad JHON", 2600, { bg: colors.tableAltRow }), dataCell("PicoClaw", 2200, { bg: colors.tableAltRow }), dataCell("Conservado", 2200, { bg: colors.tableAltRow }), dataCell("Prompt expandido", 2000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Integraci\u00f3n IA", 2600), dataCell("PicoClaw", 2200), dataCell("Adaptado", 2200), dataCell("z-ai-web-dev-sdk", 2000)] }),
        new TableRow({ children: [dataCell("Dashboard CRM", 2600, { bg: colors.tableAltRow }), dataCell("ValiFlow", 2200, { bg: colors.tableAltRow }), dataCell("Conservado", 2200, { bg: colors.tableAltRow }), dataCell("8 vistas completas", 2000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Multi-tenancy", 2600), dataCell("ValiFlow", 2200), dataCell("Conservado", 2200), dataCell("Workspaces + RLS", 2000)] }),
        new TableRow({ children: [dataCell("Billing", 2600, { bg: colors.tableAltRow }), dataCell("ValiFlow", 2200, { bg: colors.tableAltRow }), dataCell("Pendiente", 2200, { bg: colors.tableAltRow }), dataCell("Stripe (Phase 4)", 2000, { bg: colors.tableAltRow })] }),
      ],
    }),
    tableCaption("Tabla 2.1 \u2014 Matriz de decisi\u00f3n de la fusi\u00f3n ValiFlow + PicoClaw"),

    // ─── SECTION 3: Estructura de Carpetas ───
    heading1("3. Estructura de Carpetas"),

    bodyParagraph(
      "La estructura del proyecto sigue las convenciones est\u00e1ndar de Next.js 15 con App Router, organizando el c\u00f3digo en carpetas sem\u00e1nticas para mantener la escalabilidad y la legibilidad:"
    ),

    ...codeBlock([
      "src/",
      "\u251c\u2500\u2500 app/",
      "\u2502   \u251c\u2500\u2500 api/",
      "\u2502   \u2502   \u251c\u2500\u2500 ai/chat/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 webhooks/whatsapp/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 contacts/route.ts, [id]/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 conversations/route.ts, [id]/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 pipeline/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 deals/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 dashboard/stats/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 agents/route.ts, [id]/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 billing/subscription/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 analytics/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 automations/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 workspaces/route.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 seed/route.ts",
      "\u2502   \u2502   \u2514\u2500\u2500 auth/[...nextauth]/route.ts",
      "\u2502   \u251c\u2500\u2500 page.tsx",
      "\u2502   \u251c\u2500\u2500 layout.tsx",
      "\u2502   \u2514\u2500\u2500 globals.css",
      "\u251c\u2500\u2500 components/",
      "\u2502   \u251c\u2500\u2500 dashboard/",
      "\u2502   \u2502   \u251c\u2500\u2500 dashboard-layout.tsx",
      "\u2502   \u2502   \u251c\u2500\u2500 sidebar.tsx",
      "\u2502   \u2502   \u251c\u2500\u2500 header.tsx",
      "\u2502   \u2502   \u251c\u2500\u2500 dashboard-main.tsx",
      "\u2502   \u2502   \u251c\u2500\u2500 crm-pipeline.tsx",
      "\u2502   \u2502   \u251c\u2500\u2500 inbox.tsx",
      "\u2502   \u2502   \u251c\u2500\u2500 contacts-view.tsx",
      "\u2502   \u2502   \u251c\u2500\u2500 agents-view.tsx",
      "\u2502   \u2502   \u251c\u2500\u2500 analytics-view.tsx",
      "\u2502   \u2502   \u251c\u2500\u2500 automations-view.tsx",
      "\u2502   \u2502   \u2514\u2500\u2500 settings-view.tsx",
      "\u2502   \u2514\u2500\u2500 ui/  (40+ componentes shadcn)",
      "\u251c\u2500\u2500 lib/",
      "\u2502   \u251c\u2500\u2500 ai/",
      "\u2502   \u2502   \u251c\u2500\u2500 providers.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 agent-router.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 personalities.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 revenue-engine.ts",
      "\u2502   \u2502   \u251c\u2500\u2500 closing-engine.ts",
      "\u2502   \u2502   \u2514\u2500\u2500 index.ts",
      "\u2502   \u251c\u2500\u2500 auth.ts",
      "\u2502   \u251c\u2500\u2500 types.ts",
      "\u2502   \u251c\u2500\u2500 constants.ts",
      "\u2502   \u251c\u2500\u2500 utils.ts",
      "\u2502   \u2514\u2500\u2500 db.ts",
      "\u2514\u2500\u2500 hooks/",
    ]),

    emptyLine(80),

    bodyParagraph(
      "El directorio lib/ai/ contiene toda la l\u00f3gica de inteligencia artificial reimplementada de PicoClaw, mientras que components/dashboard/ agrupa las 10 vistas principales del dashboard. La carpeta ui/ contiene m\u00e1s de 40 componentes pre-construidos de shadcn/ui que proporcionan consistencia visual."
    ),

    // ─── SECTION 4: Modelo de Datos ───
    heading1("4. Modelo de Datos (Schema Prisma)"),

    bodyParagraph(
      "El modelo de datos de ValiFlow Pro se define mediante Prisma ORM con m\u00e1s de 20 modelos que cubren todos los aspectos de la plataforma: gesti\u00f3n de contactos CRM, conversaciones multi-canal, pipeline de ventas, agentes de IA, anal\u00edticas y configuraci\u00f3n de facturaci\u00f3n. La siguiente tabla resume cada modelo con sus campos principales y relaciones:"
    ),

    new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [2000, 3500, 3500],
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell("Modelo", 2000), headerCell("Campos Principales", 3500), headerCell("Relaciones", 3500),
        ]}),
        new TableRow({ children: [dataCell("User", 2000), dataCell("id, email, name, image, role", 3500), dataCell("Workspaces, AgentLogs", 3500)] }),
        new TableRow({ children: [dataCell("Workspace", 2000, { bg: colors.tableAltRow }), dataCell("id, name, slug, plan, limits", 3500, { bg: colors.tableAltRow }), dataCell("Contacts, Conversations, Deals, Agents", 3500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("WorkspaceMember", 2000), dataCell("id, role (owner/admin/agent), userId", 3500), dataCell("User, Workspace", 3500)] }),
        new TableRow({ children: [dataCell("Contact", 2000, { bg: colors.tableAltRow }), dataCell("id, name, phone, email, status, leadScore, source", 3500, { bg: colors.tableAltRow }), dataCell("Conversations, Deals, Memories", 3500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Conversation", 2000), dataCell("id, channel, status, contactId, assignedTo", 3500), dataCell("Contact, Messages, AgentLogs", 3500)] }),
        new TableRow({ children: [dataCell("Message", 2000, { bg: colors.tableAltRow }), dataCell("id, content, role (user/assistant), channel", 3500, { bg: colors.tableAltRow }), dataCell("Conversation", 3500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Pipeline", 2000), dataCell("id, name, stages[]", 3500), dataCell("Workspace, Deals, Stages", 3500)] }),
        new TableRow({ children: [dataCell("PipelineStage", 2000, { bg: colors.tableAltRow }), dataCell("id, name, order, pipelineId", 3500, { bg: colors.tableAltRow }), dataCell("Pipeline, Deals", 3500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Deal", 2000), dataCell("id, title, value, status, contactId, stageId", 3500), dataCell("Contact, Stage, Pipeline", 3500)] }),
        new TableRow({ children: [dataCell("Agent", 2000, { bg: colors.tableAltRow }), dataCell("id, name, type, model, config", 3500, { bg: colors.tableAltRow }), dataCell("Workspace, AgentLogs, Memories", 3500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("AgentMemory", 2000), dataCell("id, content, category", 3500), dataCell("Agent, Contact", 3500)] }),
        new TableRow({ children: [dataCell("AgentLog", 2000, { bg: colors.tableAltRow }), dataCell("id, input, output, tokens, duration", 3500, { bg: colors.tableAltRow }), dataCell("Agent, Conversation", 3500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Automation", 2000), dataCell("id, name, triggerType, enabled", 3500), dataCell("Workspace, WebhookConfigs", 3500)] }),
        new TableRow({ children: [dataCell("WebhookConfig", 2000, { bg: colors.tableAltRow }), dataCell("id, provider, instanceId, url", 3500, { bg: colors.tableAltRow }), dataCell("Workspace, Automation", 3500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Subscription", 2000), dataCell("id, plan, stripeId, status", 3500), dataCell("Workspace", 3500)] }),
        new TableRow({ children: [dataCell("AnalyticsEvent", 2000, { bg: colors.tableAltRow }), dataCell("id, eventType, metadata, timestamp", 3500, { bg: colors.tableAltRow }), dataCell("Workspace", 3500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Account", 2000), dataCell("id, provider, providerAccountId", 3500), dataCell("User", 3500)] }),
        new TableRow({ children: [dataCell("Session", 2000, { bg: colors.tableAltRow }), dataCell("id, sessionToken, expires", 3500, { bg: colors.tableAltRow }), dataCell("User", 3500, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("VerificationToken", 2000), dataCell("id, identifier, token, expires", 3500), dataCell("N/A", 3500)] }),
      ],
    }),
    tableCaption("Tabla 4.1 \u2014 Modelos del esquema Prisma con campos principales y relaciones"),

    bodyParagraph(
      "Todos los modelos incluyen timestamps autom\u00e1ticos (createdAt, updatedAt) y soportan soft-delete mediante campos de estado. El dise\u00f1o sigue principios de normalizaci\u00f3n con \u00edndices compuestos en campos de b\u00fasqueda frecuente como (workspaceId, status) y (contactId, channel)."
    ),

    // ─── SECTION 5: Capa de IA ───
    heading1("5. Capa de IA (PicoClaw-Style)"),

    bodyParagraph(
      "La capa de inteligencia artificial constituye el n\u00facleo diferenciador de ValiFlow Pro, heredando los patrones de PicoClaw y reimplement\u00e1ndolos en TypeScript para integraci\u00f3n nativa. Se compone de cinco m\u00f3dulos principales: Proveedores, Router de Agentes, Personalidades, Revenue Engine y Closing Engine."
    ),

    heading2("5.1 Proveedores Multi-IA"),

    bodyParagraph(
      "El sistema soporta 4 proveedores de IA a trav\u00e9s de una abstracci\u00f3n unificada implementada en providers.ts, utilizando z-ai-web-dev-sdk como capa de orquestaci\u00f3n:"
    ),

    bulletItem("Groq: Proveedor principal para baja latencia en conversaciones en tiempo real. Modelo predeterminado: llama-3.3-70b-versatile.", "bullet-s5"),
    bulletItem("DeepSeek: Proveedor alternativo con alta capacidad de razonamiento. Modelo: deepseek-chat.", "bullet-s5"),
    bulletItem("Gemini: Proveedor de Google para tareas multimodales. Modelo: gemini-2.0-flash.", "bullet-s5"),
    bulletItem("OpenAI: Proveedor de respaldo con amplia compatibilidad. Modelo: gpt-4o-mini.", "bullet-s5"),

    bodyParagraph(
      "El sistema implementa fallback autom\u00e1tico: si Groq no est\u00e1 disponible, intenta secuencialmente con los dem\u00e1s proveedores hasta obtener respuesta. Cada llamada se registra en AgentLog para an\u00e1lisis de rendimiento."
    ),

    heading2("5.2 Router de Agentes"),

    bodyParagraph(
      "El Agent Router (agent-router.ts) implementa detecci\u00f3n de intenciones basada en 12 tipos, utilizando pattern matching con normalizaci\u00f3n NFD para texto en espa\u00f1ol:"
    ),

    new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [2200, 2200, 4600],
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell("Tipo de Intenci\u00f3n", 2200), headerCell("Agente Destino", 2200), headerCell("Descripci\u00f3n", 4600),
        ]}),
        new TableRow({ children: [dataCell("GREETING", 2200), dataCell("General", 2200), dataCell("Saludos y presentaciones iniciales", 4600)] }),
        new TableRow({ children: [dataCell("VEHICLE_INQUIRY", 2200, { bg: colors.tableAltRow }), dataCell("Sales", 2200, { bg: colors.tableAltRow }), dataCell("Consultas sobre veh\u00edculos, modelos, precios", 4600, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("SCHEDULE_TEST_DRIVE", 2200), dataCell("Sales", 2200), dataCell("Solicitud de cita para prueba de manejo", 4600)] }),
        new TableRow({ children: [dataCell("FINANCING", 2200, { bg: colors.tableAltRow }), dataCell("Finance", 2200, { bg: colors.tableAltRow }), dataCell("Preguntas sobre financiamiento, cr\u00e9dito, enganches", 4600, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("TRADE_IN", 2200), dataCell("Sales", 2200), dataCell("Intercambio o aval\u00fao de veh\u00edculo actual", 4600)] }),
        new TableRow({ children: [dataCell("NEGOTIATION", 2200, { bg: colors.tableAltRow }), dataCell("Closing", 2200, { bg: colors.tableAltRow }), dataCell("Negociaci\u00f3n de precios y condiciones", 4600, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("OBJECTION", 2200), dataCell("Sales", 2200), dataCell("Objeciones de precio, competencia, dudas", 4600)] }),
        new TableRow({ children: [dataCell("APPOINTMENT", 2200, { bg: colors.tableAltRow }), dataCell("General", 2200, { bg: colors.tableAltRow }), dataCell("Solicitud de citas y reuniones", 4600, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("COMPLAINT", 2200), dataCell("Support", 2200), dataCell("Quejas, insatisfacci\u00f3n, problemas post-venta", 4600)] }),
        new TableRow({ children: [dataCell("FOLLOW_UP", 2200, { bg: colors.tableAltRow }), dataCell("General", 2200, { bg: colors.tableAltRow }), dataCell("Seguimiento y reenganche de leads", 4600, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("CLOSING", 2200), dataCell("Closing", 2200), dataCell("Se\u00f1ales de compra y cierre de trato", 4600)] }),
        new TableRow({ children: [dataCell("GENERAL", 2200, { bg: colors.tableAltRow }), dataCell("General", 2200, { bg: colors.tableAltRow }), dataCell("Consultas generales y no clasificadas", 4600, { bg: colors.tableAltRow })] }),
      ],
    }),
    tableCaption("Tabla 5.1 \u2014 Tipos de intenci\u00f3n y routing a agentes"),

    heading2("5.3 Personalidad JHON"),

    bodyParagraph(
      "JHON es la personalidad principal del sistema, dise\u00f1ada espec\u00edficamente para el sector automotriz mexicano. Se implementa en personalities.ts como un system prompt extenso que define tono, vocabulario y comportamiento:"
    ),

    bulletItem("Identidad: Asesor automotriz experto con 15 a\u00f1os de experiencia en el mercado mexicano.", "bullet-s5"),
    bulletItem("Tono: Profesional pero cercano, usando \u00abusted\u00bb con calidez y empat\u00eda. Nunca agresivo ni pushy.", "bullet-s5"),
    bulletItem("Vocabulario: T\u00e9rminos automotrices mexicanos (enganche, mensualidad, aval\u00fao, seguro todo riesgo).", "bullet-s5"),
    bulletItem("Conocimiento: Cat\u00e1logo completo de marcas, modelos, precios del mercado mexicano actual.", "bullet-s5"),
    bulletItem("Estrategia: Seguimiento de 9 pasos del Revenue Engine con t\u00e9cnicas de cierre adaptadas.", "bullet-s5"),

    bodyParagraph(
      "Adicionalmente, el sistema incluye 3 personalidades alternativas: Professional (formal B2B), Friendly (casual retail) y Aggressive (alta presi\u00f3n de cierre), configurables por agente."
    ),

    heading2("5.4 Revenue Engine"),

    bodyParagraph(
      "El Revenue Engine (revenue-engine.ts) implementa un pipeline de 9 pasos para maximizar la conversi\u00f3n de leads en ventas cerradas. Cada paso se ejecuta secuencialmente dentro de processConversation():"
    ),

    new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [800, 3200, 5000],
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell("#", 800), headerCell("Paso", 3200), headerCell("Descripci\u00f3n", 5000),
        ]}),
        new TableRow({ children: [dataCell("1", 800), dataCell("analyzeLead", 3200), dataCell("Analiza 120+ keywords automotrices mexicanos, puntaje 0-100 ponderado", 5000)] }),
        new TableRow({ children: [dataCell("2", 800, { bg: colors.tableAltRow }), dataCell("detectTrigger", 3200, { bg: colors.tableAltRow }), dataCell("Detecta triggers de compra (urgencia, presupuesto, decisi\u00f3n)", 5000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("3", 800), dataCell("makeDecision", 3200), dataCell("Decide estrategia basada en lead score y contexto", 5000)] }),
        new TableRow({ children: [dataCell("4", 800, { bg: colors.tableAltRow }), dataCell("handleObjection", 3200, { bg: colors.tableAltRow }), dataCell("Identifica y responde objeciones (precio, competencia, dudas)", 5000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("5", 800), dataCell("generateResponse", 3200), dataCell("Genera respuesta personalizada v\u00eda LLM con contexto del lead", 5000)] }),
        new TableRow({ children: [dataCell("6", 800, { bg: colors.tableAltRow }), dataCell("generateFollowUpTasks", 3200, { bg: colors.tableAltRow }), dataCell("Crea tareas de seguimiento autom\u00e1ticas", 5000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("7", 800), dataCell("generateCrmUpdates", 3200), dataCell("Genera actualizaciones para el CRM (etiquetas, notas, estado)", 5000)] }),
        new TableRow({ children: [dataCell("8", 800, { bg: colors.tableAltRow }), dataCell("routeToAgent", 3200, { bg: colors.tableAltRow }), dataCell("Enruta al agente especializado seg\u00fan intenci\u00f3n detectada", 5000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("9", 800), dataCell("processConversation", 3200), dataCell("Orquesta todo el pipeline y devuelve respuesta final", 5000)] }),
      ],
    }),
    tableCaption("Tabla 5.2 \u2014 Pipeline de 9 pasos del Revenue Engine"),

    heading2("5.5 Closing Engine"),

    bodyParagraph(
      "El Closing Engine (closing-engine.ts) proporciona evaluaci\u00f3n de closability de deals y 8 t\u00e9cnicas profesionales de cierre, cada una con un prompt espec\u00edfico generado por LLM:"
    ),

    bulletItem("Assumptive Close: Asume que el cliente ya decidi\u00f3 comprar y avanza al siguiente paso.", "bullet-s7"),
    bulletItem("Urgency Close: Crea urgencia leg\u00edtima con inventario limitado o promociones por tiempo.", "bullet-s7"),
    bulletItem("Summary Close: Resume todos los beneficios y el valor antes de pedir la decisi\u00f3n.", "bullet-s7"),
    bulletItem("Empathy Close: Reconoce las dudas del cliente y ofrece apoyo personalizado.", "bullet-s7"),
    bulletItem("Comparison Close: Compara opciones para posicionar la mejor opci\u00f3n.", "bullet-s7"),
    bulletItem("Trial Close: Prueba la disposici\u00f3n del cliente con preguntas de confirmaci\u00f3n.", "bullet-s7"),
    bulletItem("Alternative Close: Ofrece dos opciones, ambas llevando al cierre.", "bullet-s7"),
    bulletItem("Value Close: Refuerza el valor de la inversi\u00f3n frente al costo.", "bullet-s7"),

    bodyParagraph(
      "El sistema calcula un DealClosability Score basado en el engagement del lead, el n\u00famero de interacciones, las se\u00f1ales de compra detectadas y el tiempo de actividad, generando recomendaciones de t\u00e9cnica de cierre \u00f3ptima."
    ),

    // ─── SECTION 6: API Routes ───
    heading1("6. API Routes"),

    bodyParagraph(
      "ValiFlow Pro implementa 16 rutas API RESTful bajo el patr\u00f3n Next.js App Router, cubriendo todas las funcionalidades de la plataforma desde la gesti\u00f3n de contactos hasta la orquestaci\u00f3n de IA:"
    ),

    new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [3200, 1800, 4000],
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell("Ruta", 3200), headerCell("M\u00e9todos", 1800), headerCell("Descripci\u00f3n", 4000),
        ]}),
        new TableRow({ children: [dataCell("/api/ai/chat", 3200), dataCell("POST", 1800), dataCell("Chat con IA, pipeline del Revenue Engine", 4000)] }),
        new TableRow({ children: [dataCell("/api/webhooks/whatsapp", 3200, { bg: colors.tableAltRow }), dataCell("POST", 1800, { bg: colors.tableAltRow }), dataCell("Webhook Evolution API para mensajes WA", 4000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("/api/contacts", 3200), dataCell("GET, POST", 1800), dataCell("Listar/crear contactos con b\u00fasqueda y paginaci\u00f3n", 4000)] }),
        new TableRow({ children: [dataCell("/api/contacts/[id]", 3200, { bg: colors.tableAltRow }), dataCell("GET, PUT, DELETE", 1800, { bg: colors.tableAltRow }), dataCell("Detalle, actualizar, archivar contacto", 4000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("/api/conversations", 3200), dataCell("GET", 1800), dataCell("Listar conversaciones con filtros por canal", 4000)] }),
        new TableRow({ children: [dataCell("/api/conversations/[id]", 3200, { bg: colors.tableAltRow }), dataCell("GET, POST", 1800, { bg: colors.tableAltRow }), dataCell("Mensajes paginados y env\u00edo de mensajes", 4000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("/api/pipeline", 3200), dataCell("GET, POST", 1800), dataCell("Pipeline con stages y valor total agregado", 4000)] }),
        new TableRow({ children: [dataCell("/api/deals", 3200, { bg: colors.tableAltRow }), dataCell("GET, POST, PUT", 1800, { bg: colors.tableAltRow }), dataCell("CRUD de deals, movimiento entre stages", 4000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("/api/dashboard/stats", 3200), dataCell("GET", 1800), dataCell("10+ m\u00e9tricas agregadas en paralelo", 4000)] }),
        new TableRow({ children: [dataCell("/api/agents", 3200, { bg: colors.tableAltRow }), dataCell("GET, POST", 1800, { bg: colors.tableAltRow }), dataCell("Listar y crear agentes de IA", 4000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("/api/agents/[id]", 3200), dataCell("PUT, DELETE", 1800), dataCell("Actualizar y eliminar agentes", 4000)] }),
        new TableRow({ children: [dataCell("/api/billing/subscription", 3200, { bg: colors.tableAltRow }), dataCell("GET, POST", 1800, { bg: colors.tableAltRow }), dataCell("Suscripci\u00f3n y planes de facturaci\u00f3n", 4000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("/api/analytics", 3200), dataCell("GET", 1800), dataCell("Series temporales (7d/30d/90d)", 4000)] }),
        new TableRow({ children: [dataCell("/api/automations", 3200, { bg: colors.tableAltRow }), dataCell("GET, POST", 1800, { bg: colors.tableAltRow }), dataCell("Automatizaciones con triggers/actions", 4000, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("/api/workspaces", 3200), dataCell("GET, POST", 1800), dataCell("Workspaces con pipeline y suscripci\u00f3n", 4000)] }),
        new TableRow({ children: [dataCell("/api/seed", 3200, { bg: colors.tableAltRow }), dataCell("GET, POST", 1800, { bg: colors.tableAltRow }), dataCell("Datos demo: 20 contactos, 12 deals, 3 agentes", 4000, { bg: colors.tableAltRow })] }),
      ],
    }),
    tableCaption("Tabla 6.1 \u2014 Rutas API de ValiFlow Pro con m\u00e9todos y descripciones"),

    bodyParagraph(
      "Todas las rutas siguen un patr\u00f3n consistente: validaci\u00f3n de par\u00e1metros, comprobaci\u00f3n de workspace, l\u00f3gica de negocio y respuesta JSON estructurada con manejo de errores. La ruta /api/ai/chat orquesta el pipeline completo del Revenue Engine, incluyendo creaci\u00f3n autom\u00e1tica de contactos y conversaciones."
    ),

    // ─── SECTION 7: Dashboard ───
    heading1("7. Dashboard"),

    bodyParagraph(
      "El dashboard de ValiFlow Pro comprende 8 vistas principales integradas en un layout profesional con sidebar oscura y acentos esmeralda (#10b981), dise\u00f1ado para ser completamente responsivo y optimizado para uso diario por asesores automotrices."
    ),

    heading2("7.1 Vistas del Dashboard"),

    new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [1800, 2600, 4600],
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell("Vista", 1800), headerCell("Componente", 2600), headerCell("Funcionalidad", 4600),
        ]}),
        new TableRow({ children: [dataCell("Dashboard", 1800), dataCell("dashboard-main.tsx", 2600), dataCell("4 KPIs con tendencias, gr\u00e1ficos BarChart y AreaChart, feed de actividad, resumen de pipeline", 4600)] }),
        new TableRow({ children: [dataCell("Bandeja", 1800, { bg: colors.tableAltRow }), dataCell("inbox.tsx", 2600, { bg: colors.tableAltRow }), dataCell("Conversaciones multi-canal, chat estilo WhatsApp, respuestas r\u00e1pidas, badges de mensajes IA", 4600, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Pipeline", 1800), dataCell("crm-pipeline.tsx", 2600), dataCell("Kanban con 7 etapas, drag-and-drop (@dnd-kit), di\u00e1logo para crear deals", 4600)] }),
        new TableRow({ children: [dataCell("Contactos", 1800, { bg: colors.tableAltRow }), dataCell("contacts-view.tsx", 2600, { bg: colors.tableAltRow }), dataCell("Tabla con b\u00fasqueda/filtros, panel deslizante de detalle, di\u00e1logo nuevo contacto", 4600, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Agentes IA", 1800), dataCell("agents-view.tsx", 2600), dataCell("Tarjetas con m\u00e9tricas, di\u00e1logo tabs (general/modelo/personalidad/hooks)", 4600)] }),
        new TableRow({ children: [dataCell("Anal\u00edticas", 1800, { bg: colors.tableAltRow }), dataCell("analytics-view.tsx", 2600, { bg: colors.tableAltRow }), dataCell("Selector per\u00edodo, gr\u00e1ficos (Area, Pie, Bar), embudo conversi\u00f3n, tabla agentes", 4600, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Automatizaciones", 1800), dataCell("automations-view.tsx", 2600), dataCell("Tarjetas con triggers, flujo de acciones, switches, barras de \u00e9xito", 4600)] }),
        new TableRow({ children: [dataCell("Configuraci\u00f3n", 1800, { bg: colors.tableAltRow }), dataCell("settings-view.tsx", 2600, { bg: colors.tableAltRow }), dataCell("5 tabs: General, WhatsApp, Proveedores IA, Facturaci\u00f3n, Personalidad", 4600, { bg: colors.tableAltRow })] }),
      ],
    }),
    tableCaption("Tabla 7.1 \u2014 Vistas del Dashboard con componentes y funcionalidades"),

    heading2("7.2 Dise\u00f1o Visual"),

    bodyParagraph(
      "El dise\u00f1o del dashboard sigue las siguientes directrices: sidebar lateral oscura (#0a0a0a) con 8 \u00edtems de navegaci\u00f3n, \u00e1rea de contenido limpia sobre fondo blanco, acentos en esmeralda (#10b981) para indicadores activos y botones primarios. La tipograf\u00eda utiliza el sistema de fuentes del navegador para m\u00e1xima velocidad de carga. El layout es completamente responsivo: en pantallas menores a 768px, el sidebar se transforma en un Sheet (drawer) deslizable."
    ),

    bodyParagraph(
      "Los componentes utilizan la biblioteca shadcn/ui (m\u00e1s de 40 componentes) incluyendo Card, Badge, Avatar, Dialog, Sheet, Tabs, Select, Table, Switch, DropdownMenu, entre otros. Los gr\u00e1ficos se implementan con Recharts (AreaChart, BarChart, PieChart)."
    ),

    // ─── SECTION 8: Plan de Implementaci\u00f3n ───
    heading1("8. Plan de Implementaci\u00f3n en Fases"),

    bodyParagraph(
      "El desarrollo de ValiFlow Pro se estructura en 4 fases de una semana cada una, siguiendo un enfoque incremental que prioriza la infraestructura base, seguida de la capa de IA, luego la interfaz de usuario y finalmente el endurecimiento para producci\u00f3n:"
    ),

    new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [1400, 1200, 6400],
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell("Fase", 1400), headerCell("Periodo", 1200), headerCell("Entregables", 6400),
        ]}),
        new TableRow({ children: [
          dataCell("Fase 1", 1400), dataCell("Semana 1", 1200),
          dataCell("Infraestructura base: tipos TypeScript, constantes, autenticaci\u00f3n NextAuth v4, utilidades, middleware. Schema Prisma con 20+ modelos.", 6400, { align: AlignmentType.LEFT }),
        ]}),
        new TableRow({ children: [
          dataCell("", 1400, { bg: colors.tableAltRow }), dataCell("", 1200, { bg: colors.tableAltRow }),
          dataCell("Estado: COMPLETADO", 6400, { bg: colors.tableAltRow, align: AlignmentType.LEFT, bold: true, color: "16a34a" }),
        ]}),
        new TableRow({ children: [
          dataCell("Fase 2", 1400), dataCell("Semana 2", 1200),
          dataCell("Capa de IA completa: providers multi-IA, agent router (12 intenciones), 4 personalidades, Revenue Engine (9 pasos), Closing Engine (8 t\u00e9cnicas).", 6400, { align: AlignmentType.LEFT }),
        ]}),
        new TableRow({ children: [
          dataCell("", 1400, { bg: colors.tableAltRow }), dataCell("", 1200, { bg: colors.tableAltRow }),
          dataCell("Estado: COMPLETADO", 6400, { bg: colors.tableAltRow, align: AlignmentType.LEFT, bold: true, color: "16a34a" }),
        ]}),
        new TableRow({ children: [
          dataCell("Fase 3", 1400), dataCell("Semana 3", 1200),
          dataCell("16 rutas API completas: AI chat, webhooks, CRUD contactos/conversaciones/deals/agentes, dashboard stats, analytics, billing, automations, workspaces, seed data. Dashboard con 8 vistas.", 6400, { align: AlignmentType.LEFT }),
        ]}),
        new TableRow({ children: [
          dataCell("", 1400, { bg: colors.tableAltRow }), dataCell("", 1200, { bg: colors.tableAltRow }),
          dataCell("Estado: COMPLETADO", 6400, { bg: colors.tableAltRow, align: AlignmentType.LEFT, bold: true, color: "16a34a" }),
        ]}),
        new TableRow({ children: [
          dataCell("Fase 4", 1400), dataCell("Semana 4", 1200),
          dataCell("Endurecimiento para producci\u00f3n: migraci\u00f3n a PostgreSQL/Supabase, autenticaci\u00f3n real con bcrypt, Stripe, WhatsApp Business API via Evolution API, rate limiting, tests.", 6400, { align: AlignmentType.LEFT }),
        ]}),
        new TableRow({ children: [
          dataCell("", 1400, { bg: colors.tableAltRow }), dataCell("", 1200, { bg: colors.tableAltRow }),
          dataCell("Estado: PENDIENTE", 6400, { bg: colors.tableAltRow, align: AlignmentType.LEFT, bold: true, color: "d97706" }),
        ]}),
      ],
    }),
    tableCaption("Tabla 8.1 \u2014 Plan de implementaci\u00f3n por fases"),

    // ─── SECTION 9: Tareas Pendientes ───
    heading1("9. Tareas Pendientes para Producci\u00f3n"),

    bodyParagraph(
      "Para llevar ValiFlow Pro a producci\u00f3n, se requiere completar las siguientes tareas, priorizadas por impacto en la operaci\u00f3n y estimaci\u00f3n de esfuerzo:"
    ),

    new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [3600, 1200, 1800, 2400],
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell("Tarea", 3600), headerCell("Prioridad", 1200), headerCell("Esfuerzo", 1800), headerCell("Dependencias", 2400),
        ]}),
        new TableRow({ children: [dataCell("Migrar SQLite a PostgreSQL/Supabase", 3600, { align: AlignmentType.LEFT }), dataCell("ALTA", 1200, { bold: true, color: "dc2626" }), dataCell("3-4 d\u00edas", 1800), dataCell("Schema finalizado", 2400)] }),
        new TableRow({ children: [dataCell("Implementar NextAuth real con bcrypt", 3600, { align: AlignmentType.LEFT, bg: colors.tableAltRow }), dataCell("ALTA", 1200, { bg: colors.tableAltRow, bold: true, color: "dc2626" }), dataCell("2-3 d\u00edas", 1800, { bg: colors.tableAltRow }), dataCell("PostgreSQL", 2400, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Integraci\u00f3n Stripe Billing", 3600, { align: AlignmentType.LEFT }), dataCell("ALTA", 1200, { bold: true, color: "dc2626" }), dataCell("4-5 d\u00edas", 1800), dataCell("Auth, Workspace", 2400)] }),
        new TableRow({ children: [dataCell("WhatsApp Business API via Evolution API", 3600, { align: AlignmentType.LEFT, bg: colors.tableAltRow }), dataCell("ALTA", 1200, { bg: colors.tableAltRow, bold: true, color: "dc2626" }), dataCell("3-4 d\u00edas", 1800, { bg: colors.tableAltRow }), dataCell("Infraestructura", 2400, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Rate limiting en rutas API", 3600, { align: AlignmentType.LEFT }), dataCell("MEDIA", 1200, { bold: true, color: "d97706" }), dataCell("1-2 d\u00edas", 1800), dataCell("Ninguna", 2400)] }),
        new TableRow({ children: [dataCell("Tests unitarios para capa IA", 3600, { align: AlignmentType.LEFT, bg: colors.tableAltRow }), dataCell("MEDIA", 1200, { bg: colors.tableAltRow, bold: true, color: "d97706" }), dataCell("3-4 d\u00edas", 1800, { bg: colors.tableAltRow }), dataCell("AI layer estable", 2400, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("Tests end-to-end", 3600, { align: AlignmentType.LEFT }), dataCell("MEDIA", 1200, { bold: true, color: "d97706" }), dataCell("2-3 d\u00edas", 1800), dataCell("Features completas", 2400)] }),
        new TableRow({ children: [dataCell("Optimizaci\u00f3n m\u00f3vil", 3600, { align: AlignmentType.LEFT, bg: colors.tableAltRow }), dataCell("BAJA", 1200, { bg: colors.tableAltRow, bold: true, color: "16a34a" }), dataCell("2-3 d\u00edas", 1800, { bg: colors.tableAltRow }), dataCell("UI completa", 2400, { bg: colors.tableAltRow })] }),
        new TableRow({ children: [dataCell("White-label para Enterprise", 3600, { align: AlignmentType.LEFT }), dataCell("BAJA", 1200, { bold: true, color: "16a34a" }), dataCell("5-7 d\u00edas", 1800), dataCell("Core estable", 2400)] }),
        new TableRow({ children: [dataCell("Pipeline CI/CD", 3600, { align: AlignmentType.LEFT, bg: colors.tableAltRow }), dataCell("MEDIA", 1200, { bg: colors.tableAltRow, bold: true, color: "d97706" }), dataCell("1-2 d\u00edas", 1800, { bg: colors.tableAltRow }), dataCell("Tests definidos", 2400, { bg: colors.tableAltRow })] }),
      ],
    }),
    tableCaption("Tabla 9.1 \u2014 Tareas pendientes para producci\u00f3n con prioridad y esfuerzo estimado"),

    bodyParagraph(
      "Las tareas de prioridad ALTA son bloqueantes para el lanzamiento y deben completarse en la Fase 4. Las tareas MEDIA se pueden abordar en paralelo o post-lanzamiento. Las tareas BAJA corresponden a mejoras que pueden implementarse iterativamente una vez en producci\u00f3n."
    ),

    emptyLine(200),

    bodyParagraph(
      "La estimaci\u00f3n total de la Fase 4 es de aproximadamente 3-4 semanas, concentrando los esfuerzos en la estabilizaci\u00f3n y las integraciones cr\u00edticas de pago y mensajer\u00eda. Una vez completada esta fase, ValiFlow Pro estar\u00e1 listo para su despliegue en producci\u00f3n y pruebas beta con concesionarios automotrices en M\u00e9xico."
    ),
  ],
};

// ═══════════════════════════════════════════
// BACK COVER SECTION
// ═══════════════════════════════════════════
const backCoverSection = {
  properties: {
    page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, size: { width: 11906, height: 16838 } },
  },
  headers: { default: new Header({ children: [new Paragraph({ children: [] })] }) },
  footers: { default: new Footer({ children: [new Paragraph({ children: [] })] }) },
  children: [
    emptyLine(5000),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "VALIFLOW PRO", font: "Times New Roman", size: 48, bold: true, color: colors.primary, characterSpacing: 120 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500", font: "Calibri", size: 20, color: colors.accent }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Plataforma SaaS de Automatizaci\u00f3n de Ventas con IA", font: "Calibri", size: 22, color: colors.secondary }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({ text: "Sector Automotriz Mexicano", font: "Calibri", size: 22, color: colors.secondary, italics: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({ text: "Confidencial \u2014 Documento Interno", font: "Calibri", size: 18, color: colors.accent, italics: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "\u00a9 2026 ValiFlow Pro. Todos los derechos reservados.", font: "Calibri", size: 18, color: colors.accent }),
      ],
    }),
  ],
};

// ═══════════════════════════════════════════
// DOCUMENT ASSEMBLY
// ═══════════════════════════════════════════
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22, color: colors.body } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, color: colors.primary, font: "Times New Roman" },
        paragraph: { spacing: { before: 600, after: 300 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, color: colors.body, font: "Times New Roman" },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: colors.secondary, font: "Times New Roman" },
        paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: numberingConfig,
  sections: [coverSection, tocSection, mainContent, backCoverSection],
});

// ═══════════════════════════════════════════
// GENERATE
// ═══════════════════════════════════════════
const OUTPUT_PATH = "/home/z/my-project/download/ValiFlow_Pro_Arquitectura_Fusionada.docx";

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUTPUT_PATH, buffer);
  console.log(`Document generated successfully: ${OUTPUT_PATH}`);
});
