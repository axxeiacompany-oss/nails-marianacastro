import heroFrenchImg from './assets/images/hero_french_nails_atelier_1791591596092.jpg';
import encapsulatedFlowersImg from './assets/images/service_encapsulated_flowers_1791591605287.jpg';
import chromeCatEyeImg from './assets/images/service_chrome_cat_eye_1791591616240.jpg';
import babyBoomerGlitterImg from './assets/images/service_baby_boomer_glitter_1791591624954.jpg';

export type ServiceCategory =
  | 'Alongamento'
  | 'Manutenção'
  | 'Banho de Gel & Blindagem'
  | 'Nail Art & Spa';

export type NailShape = 'Amendoada' | 'Quadrada' | 'Bailarina' | 'Stiletto' | 'Natural';

export type NailFinish =
  | 'Francesa Reversa / Sorriso'
  | 'Encapsulada com Flores / Ouro'
  | 'Cat-Eye / Cromado Prata'
  | 'Baby Boomer & Glitter'
  | 'Nude Translúcido Natural';

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface StudioService {
  id: string;
  name: string;
  category: ServiceCategory;
  description: string;
  durationMinutes: number;
  priceCents: number;
  imageKey: string;
  active: boolean;
}

export interface BookedSlotRecord {
  id: string;
  date: string;
  time: string;
  durationMinutes: number;
  status: 'pending' | 'confirmed' | 'blocked' | 'cancelled';
  appointmentId: string;
}

export interface AppointmentRecord {
  id: string;
  protocolCode: string;
  clientName: string;
  clientPhone: string;
  clientInstagram: string;
  serviceId: string;
  serviceName: string;
  serviceCategory: string;
  priceCents: number;
  durationMinutes: number;
  nailShape: NailShape;
  nailFinish: NailFinish;
  date: string;
  time: string;
  slotId: string;
  notes: string;
  status: AppointmentStatus;
  createdAt?: string;
  updatedAt?: string;
}

export const STUDIO_IMAGES: Record<string, string> = {
  french_atelier: heroFrenchImg,
  encapsulated_flowers: encapsulatedFlowersImg,
  chrome_cat_eye: chromeCatEyeImg,
  baby_boomer_glitter: babyBoomerGlitterImg,
};

export const NAIL_SHAPES: NailShape[] = [
  'Amendoada',
  'Quadrada',
  'Bailarina',
  'Stiletto',
  'Natural',
];

export const NAIL_FINISHES: NailFinish[] = [
  'Francesa Reversa / Sorriso',
  'Encapsulada com Flores / Ouro',
  'Cat-Eye / Cromado Prata',
  'Baby Boomer & Glitter',
  'Nude Translúcido Natural',
];

export const STUDIO_HOURS: string[] = [
  '09:00',
  '10:30',
  '13:00',
  '14:30',
  '16:00',
  '17:30',
  '19:00',
];

export const DEFAULT_STUDIO_SERVICES: StudioService[] = [
  {
    id: 'alongamento-fibra-francesa',
    name: 'Alongamento em Fibra — Francesa Reversa',
    category: 'Alongamento',
    description:
      'Alongamento estruturado em fibra de vidro com curvatura natural, leito rosado translúcido e ponta branca sorriso de alta precisão.',
    durationMinutes: 150,
    priceCents: 18500,
    imageKey: 'french_atelier',
    active: true,
  },
  {
    id: 'alongamento-encapsulado-botanico',
    name: 'Alongamento Encapsulado — Flores Secas & Folha de Ouro',
    category: 'Alongamento',
    description:
      'Design autoral encapsulado em gel construtor cristal com microflores desidratadas, detalhes em folha de ouro 24k e acabamento espelhado.',
    durationMinutes: 165,
    priceCents: 21000,
    imageKey: 'encapsulated_flowers',
    active: true,
  },
  {
    id: 'banho-gel-cat-eye-prata',
    name: 'Banho de Gel & Efeito Cat-Eye Magnético Prata',
    category: 'Banho de Gel & Blindagem',
    description:
      'Estruturação protetora sobre a unha natural com pigmento magnético acetinado prateado e cuticulagem russa combinada.',
    durationMinutes: 105,
    priceCents: 14500,
    imageKey: 'chrome_cat_eye',
    active: true,
  },
  {
    id: 'alongamento-baby-boomer-rose',
    name: 'Alongamento Gel — Baby Boomer & Cascata Rose Gold',
    category: 'Alongamento',
    description:
      'Degradê suave entre nude natural e ponta leitosa com véu delicado de glitter fino rose gold e selagem de longa duração.',
    durationMinutes: 150,
    priceCents: 19000,
    imageKey: 'baby_boomer_glitter',
    active: true,
  },
  {
    id: 'manutencao-estrutural-gel',
    name: 'Manutenção de Alongamento (Até 25 dias)',
    category: 'Manutenção',
    description:
      'Remoção segura de 70% do produto anterior, realinhamento de simetria, reposição de ponto de tensão, cuticulagem e nova arte.',
    durationMinutes: 120,
    priceCents: 13500,
    imageKey: 'french_atelier',
    active: true,
  },
  {
    id: 'blindagem-diamante-nude',
    name: 'Blindagem de Diamante + Esmaltação em Gel',
    category: 'Banho de Gel & Blindagem',
    description:
      'Camada flexível de gel base para unhas naturais que evita quebras e mantém o brilho intacto por até 21 dias.',
    durationMinutes: 90,
    priceCents: 11500,
    imageKey: 'baby_boomer_glitter',
    active: true,
  },
];

export function formatCurrencyBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function formatDateBR(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function getNextDays(count: number): {
  iso: string;
  dayNumber: string;
  weekdayShort: string;
  monthShort: string;
  isSunday: boolean;
}[] {
  const result = [];
  const base = new Date();
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    result.push({
      iso: `${yyyy}-${mm}-${dd}`,
      dayNumber: dd,
      weekdayShort: weekdays[d.getDay()],
      monthShort: months[d.getMonth()],
      isSunday: d.getDay() === 0,
    });
  }
  return result;
}

export function generateProtocolCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `MC-${suffix}`;
}

export function getInitialDemoData(firstOpenDay: string, secondOpenDay: string): {
  appointments: AppointmentRecord[];
  slots: BookedSlotRecord[];
} {
  const appointments: AppointmentRecord[] = [
    {
      id: 'MC-8F4K2A',
      protocolCode: 'MC-8F4K2A',
      clientName: 'Beatriz Alencar',
      clientPhone: '(11) 99812-4401',
      clientInstagram: '@bia.alencar',
      serviceId: 'alongamento-fibra-francesa',
      serviceName: 'Alongamento em Fibra — Francesa Reversa',
      serviceCategory: 'Alongamento',
      priceCents: 18500,
      durationMinutes: 150,
      nailShape: 'Amendoada',
      nailFinish: 'Francesa Reversa / Sorriso',
      date: firstOpenDay,
      time: '09:00',
      slotId: `slot_${firstOpenDay}_0900`,
      notes: 'Gosto do leito rosado bem natural e ponta sorriso fina.',
      status: 'confirmed',
    },
    {
      id: 'MC-3M9P7X',
      protocolCode: 'MC-3M9P7X',
      clientName: 'Fernanda Vasconcelos',
      clientPhone: '(11) 99430-8821',
      clientInstagram: '@fevasconcelos',
      serviceId: 'alongamento-encapsulado-botanico',
      serviceName: 'Alongamento Encapsulado — Flores Secas & Folha de Ouro',
      serviceCategory: 'Alongamento',
      priceCents: 21000,
      durationMinutes: 165,
      nailShape: 'Quadrada',
      nailFinish: 'Encapsulada com Flores / Ouro',
      date: firstOpenDay,
      time: '14:30',
      slotId: `slot_${firstOpenDay}_1430`,
      notes: 'Quero colocar florzinha seca no anelar e folha de ouro.',
      status: 'pending',
    },
    {
      id: 'MC-6R2W9Q',
      protocolCode: 'MC-6R2W9Q',
      clientName: 'Camila Rocha',
      clientPhone: '(11) 98761-1092',
      clientInstagram: '@camilarocha_',
      serviceId: 'banho-gel-cat-eye-prata',
      serviceName: 'Banho de Gel & Efeito Cat-Eye Magnético Prata',
      serviceCategory: 'Banho de Gel & Blindagem',
      priceCents: 14500,
      durationMinutes: 105,
      nailShape: 'Amendoada',
      nailFinish: 'Cat-Eye / Cromado Prata',
      date: secondOpenDay,
      time: '10:30',
      slotId: `slot_${secondOpenDay}_1030`,
      notes: 'Primeira vez fazendo banho de gel.',
      status: 'confirmed',
    },
    {
      id: 'MC-5L7N4V',
      protocolCode: 'MC-5L7N4V',
      clientName: 'Larissa Monteiro',
      clientPhone: '(11) 99105-6734',
      clientInstagram: '@larimonteiro',
      serviceId: 'manutencao-estrutural-gel',
      serviceName: 'Manutenção de Alongamento (Até 25 dias)',
      serviceCategory: 'Manutenção',
      priceCents: 13500,
      durationMinutes: 120,
      nailShape: 'Bailarina',
      nailFinish: 'Baby Boomer & Glitter',
      date: secondOpenDay,
      time: '16:00',
      slotId: `slot_${secondOpenDay}_1600`,
      notes: 'Manutenção de 21 dias, todas as unhas intactas.',
      status: 'completed',
    },
  ];

  const slots: BookedSlotRecord[] = appointments.map((a) => ({
    id: a.slotId,
    date: a.date,
    time: a.time,
    durationMinutes: a.durationMinutes,
    status:
      a.status === 'cancelled'
        ? 'cancelled'
        : a.status === 'confirmed' || a.status === 'completed'
        ? 'confirmed'
        : 'pending',
    appointmentId: a.id,
  }));

  return { appointments, slots };
}
