import type { CampaignType } from '@/lib/campaigns';
import type {
  CampaignRecommendation,
  NgoOnboardingProfile
} from './types';

function compactText(value?: string | null): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildCrowdfundingTitle(profile: NgoOnboardingProfile): string {
  const explicit = compactText(profile.campaignSeed.title);
  if (explicit) return explicit;

  const useOfFunds = compactText(profile.campaignSeed.useOfFunds);
  if (useOfFunds) return `Ayudanos a financiar ${useOfFunds}`;

  const firstProgram = compactText(profile.impact.programs[0]);
  if (firstProgram) return `Impulsá ${firstProgram}`;

  const cause = compactText(profile.organization.cause);
  if (cause) return `Sumate a ${cause}`;

  return `Apoyá a ${profile.organization.name || 'nuestra organización'}`;
}

function recommendationReason(
  profile: NgoOnboardingProfile,
  type: CampaignType
): string {
  if (type === 'tienda') {
    return profile.storeSeed.products.length > 0
      ? 'Conviene una tienda solidaria porque ya aparecieron productos o aportes simbólicos concretos para ofrecer.'
      : 'Conviene una tienda solidaria para transformar el interés de la comunidad en aportes concretos y repetibles.';
  }

  if (profile.campaignSeed.title || profile.campaignSeed.useOfFunds) {
    return 'Conviene arrancar con una landing de crowdfunding porque ya surgió una necesidad concreta para recaudar.';
  }

  if (profile.fundraising.mainChallenge) {
    return 'Conviene una landing de crowdfunding para ordenar el mensaje de recaudación y enfocar una campaña clara.';
  }

  return 'Conviene una landing de crowdfunding para convertir mejor el interés de la comunidad en donaciones.';
}

function buildPromptSeed(
  profile: NgoOnboardingProfile,
  title: string,
  type: CampaignType
): string {
  if (type === 'tienda') {
    const products = profile.storeSeed.products
      .map((p) => p.name)
      .filter(Boolean)
      .slice(0, 5);

    return [
      `Crear una tienda solidaria para "${title}".`,
      products.length
        ? `Tomar como base estos productos o aportes: ${products.join(', ')}.`
        : 'Incluir productos o aportes simbólicos simples y fáciles de entender.',
      profile.streetFundraisingGuideSeed.preferredTone
        ? `Usar tono ${profile.streetFundraisingGuideSeed.preferredTone}.`
        : 'Usar un tono cercano, transparente y concreto.'
    ].join(' ');
  }

  return [
    `Crear una landing de crowdfunding para "${title}".`,
    profile.campaignSeed.useOfFunds
      ? `Explicar que los fondos se usan para: ${profile.campaignSeed.useOfFunds}.`
      : 'Explicar con claridad para qué se recauda.',
    profile.fundraising.mainChallenge
      ? `Responder al desafío actual: ${profile.fundraising.mainChallenge}.`
      : 'Priorizar claridad, confianza y conversión.'
  ].join(' ');
}

function uniquePush(
  acc: CampaignRecommendation[],
  next: CampaignRecommendation
): void {
  if (
    acc.some(
      (item) =>
        item.id === next.id ||
        item.title.trim().toLowerCase() === next.title.trim().toLowerCase()
    )
  ) {
    return;
  }
  acc.push(next);
}

export function buildCampaignRecommendations(
  profile: NgoOnboardingProfile
): CampaignRecommendation[] {
  const recommendations: CampaignRecommendation[] = [];
  const primaryTitle = buildCrowdfundingTitle(profile);

  uniquePush(recommendations, {
    id: 'primary-crowdfunding',
    type: 'crowdfunding',
    title: primaryTitle,
    reason: recommendationReason(profile, 'crowdfunding'),
    promptSeed: buildPromptSeed(profile, primaryTitle, 'crowdfunding')
  });

  const hasStoreSignals =
    profile.storeSeed.hasProducts || profile.storeSeed.products.length > 0;

  if (hasStoreSignals) {
    const storeTitle =
      profile.storeSeed.products.length > 0
        ? `Tienda solidaria de ${profile.organization.name || 'la organización'}`
        : `Aportes solidarios para ${profile.organization.name || 'la organización'}`;

    uniquePush(recommendations, {
      id: 'solidarity-store',
      type: 'tienda',
      title: storeTitle,
      reason: recommendationReason(profile, 'tienda'),
      promptSeed: buildPromptSeed(profile, storeTitle, 'tienda')
    });
  }

  const extraCrowdfundingTitles = [
    profile.impact.programs[0]
      ? `Apoyá ${titleCase(compactText(profile.impact.programs[0]))}`
      : '',
    profile.organization.cause
      ? `Impulsá nuestra causa: ${compactText(profile.organization.cause)}`
      : '',
    profile.campaignSeed.useOfFunds
      ? `Financiemos ${compactText(profile.campaignSeed.useOfFunds)}`
      : ''
  ].filter(Boolean);

  for (const [index, title] of extraCrowdfundingTitles.entries()) {
    uniquePush(recommendations, {
      id: `extra-crowdfunding-${index + 1}`,
      type: 'crowdfunding',
      title,
      reason:
        'Sirve como una segunda variante de campaña para probar otro ángulo de mensaje o foco de recaudación.',
      promptSeed: buildPromptSeed(profile, title, 'crowdfunding')
    });
    if (recommendations.length >= 3) break;
  }

  if (recommendations.length < 3) {
    uniquePush(recommendations, {
      id: 'community-support',
      type: 'crowdfunding',
      title: `Sostengamos el trabajo de ${profile.organization.name || 'la organización'}`,
      reason:
        'Aporta una variante más institucional para captar apoyo general cuando no hay suficientes campañas específicas definidas.',
      promptSeed: buildPromptSeed(
        profile,
        `Sostengamos el trabajo de ${profile.organization.name || 'la organización'}`,
        'crowdfunding'
      )
    });
  }

  return recommendations.slice(0, 3);
}

export function buildCampaignPromptFromProfile(params: {
  profile: NgoOnboardingProfile;
  recommendation: CampaignRecommendation;
}): string {
  const { profile, recommendation } = params;
  const orgName = compactText(profile.organization.name) || 'la organización';
  const cause = compactText(profile.organization.cause);
  const oneLiner = compactText(profile.organization.oneLiner);
  const beneficiaries = compactText(profile.organization.beneficiaries);
  const programs = profile.impact.programs.filter(Boolean).slice(0, 4);
  const channels = [
    profile.channels.whatsapp && 'WhatsApp',
    profile.channels.instagram && 'Instagram',
    profile.channels.email && 'email',
    profile.channels.website && 'sitio web',
    profile.channels.events && 'eventos',
    profile.channels.streetFundraising && 'captación en calle'
  ].filter(Boolean);
  const products = profile.storeSeed.products
    .map((product) => product.name)
    .filter(Boolean)
    .slice(0, 6);

  return [
    `Crear una página de tipo ${recommendation.type} para ${orgName}.`,
    oneLiner ? `Descripción breve: ${oneLiner}.` : '',
    cause ? `Causa principal: ${cause}.` : '',
    beneficiaries ? `Beneficiarios: ${beneficiaries}.` : '',
    programs.length
      ? `Programas o actividades relevantes: ${programs.join(', ')}.`
      : '',
    profile.campaignSeed.useOfFunds
      ? `Uso de fondos priorizado: ${profile.campaignSeed.useOfFunds}.`
      : '',
    profile.fundraising.mainChallenge
      ? `Desafío actual de recaudación: ${profile.fundraising.mainChallenge}.`
      : '',
    channels.length
      ? `Canales actuales de comunicación: ${channels.join(', ')}.`
      : '',
    profile.streetFundraisingGuideSeed.preferredTone
      ? `Tono preferido: ${profile.streetFundraisingGuideSeed.preferredTone}.`
      : 'Tono preferido: cercano, transparente y concreto.',
    recommendation.promptSeed,
    recommendation.type === 'tienda' && products.length
      ? `Usar como insumo estos productos o aportes simbólicos: ${products.join(', ')}.`
      : '',
    'Escribir todo en español rioplatense claro.',
    'La página debe priorizar claridad, confianza y conversión sin prometer resultados garantizados.'
  ]
    .filter(Boolean)
    .join('\n');
}
