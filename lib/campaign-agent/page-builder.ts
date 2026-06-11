import type { Data } from '@puckeditor/core';
import type { CampaignState, PageSection } from './types';

type NewSection = Omit<PageSection, 'id' | 'orgId' | 'campaignDraftId' | 'createdAt' | 'updatedAt'>;

export async function buildBasicPageSections(state: CampaignState): Promise<NewSection[]> {
  const draft = state.draft;
  const firstPoint = state.receptionPoints[0];
  const title = draft.title || draft.structured.title || 'Colecta solidaria';
  const items = draft.structured.collectedItems || 'donaciones';
  const beneficiary = draft.structured.beneficiarySummary || 'personas acompañadas por la organización';
  const deadline = draft.structured.deadline || 'fecha a confirmar';
  const logistics = firstPoint
    ? `${firstPoint.name}: ${firstPoint.address}. Horarios: ${firstPoint.schedule}.`
    : 'La organización informará los puntos de recepción.';

  return [
    {
      type: 'hero',
      title,
      content: `Sumate a esta colecta de ${items} para ${beneficiary}.`,
      ctaLabel: 'Quiero colaborar',
      ctaHref: '#como-ayudar',
      sourceQuestionKeys: ['campaign.goal', 'campaign.name', 'beneficiaries.groups'],
      missingData: [],
      order: 1,
      public: true
    },
    {
      type: 'goal',
      title: 'Objetivo de la colecta',
      content: `Estamos organizando la recepción de ${items}. Fecha límite estimada: ${deadline}.`,
      sourceQuestionKeys: ['campaign.goal', 'campaign.deadline'],
      missingData: draft.structured.deadline ? [] : ['campaign.deadline'],
      order: 2,
      public: true
    },
    {
      type: 'how_to_help',
      title: 'Cómo ayudar',
      content: 'Podés comprometer tu donación y acercarla al punto de recepción indicado. La organización hará seguimiento para confirmar recepción y entrega.',
      ctaLabel: 'Anotarme para colaborar',
      ctaHref: '#contacto',
      sourceQuestionKeys: ['collaborators.signup_mode', 'logistics.receipt_confirmation_mode'],
      missingData: [],
      order: 3,
      public: true
    },
    {
      type: 'logistics',
      title: 'Punto de recepción',
      content: logistics,
      sourceQuestionKeys: ['logistics.reception_points'],
      missingData: firstPoint ? [] : ['logistics.reception_points'],
      order: 4,
      public: true
    },
    {
      type: 'transparency',
      title: 'Privacidad y transparencia',
      content: 'Los datos personales de beneficiarios quedan privados. La página muestra información agregada para cuidar a las personas involucradas.',
      sourceQuestionKeys: ['beneficiaries.privacy_level', 'page.public_private_review'],
      missingData: [],
      order: 5,
      public: true
    }
  ];
}

export function pageSectionsToPuckData(sections: Array<NewSection | PageSection>): Data {
  const content: Array<{ type: string; props: Record<string, unknown> }> = sections
    .sort((a, b) => a.order - b.order)
    .flatMap((section) => {
      if (section.type === 'hero') {
        return [
          { type: 'Hero', props: { title: section.title, subtitle: section.content, align: 'center' } },
          section.ctaLabel ? { type: 'Button', props: { label: section.ctaLabel, href: section.ctaHref ?? '#', variant: 'primary' } } : null
        ].filter(Boolean) as Array<{ type: string; props: Record<string, unknown> }>;
      }
      return [
        { type: 'Heading', props: { text: section.title, level: 'h2' } },
        { type: 'Text', props: { text: section.content, align: 'left' } },
        section.ctaLabel ? { type: 'Button', props: { label: section.ctaLabel, href: section.ctaHref ?? '#', variant: 'primary' } } : null,
        { type: 'Spacer', props: { size: 16 } }
      ].filter(Boolean) as Array<{ type: string; props: Record<string, unknown> }>;
    });

  return {
    root: { props: { title: sections[0]?.title ?? 'Colecta solidaria' } },
    content
  } as Data;
}
