import { withBase } from '../media/paths';
import type { ProfileSection } from './profile';

export const SECTION_META: Record<
  ProfileSection,
  { title: string; href: string; backLabel: string }
> = {
  inicio: { title: 'Recentes', href: withBase(), backLabel: 'Início' },
  publicacoes: {
    title: 'Publicações',
    href: withBase('publicacoes/'),
    backLabel: 'Publicações',
  },
  moments: { title: 'Moments', href: withBase('moments/'), backLabel: 'Moments' },
  eventos: { title: 'Eventos', href: withBase('eventos/'), backLabel: 'Eventos' },
  'area-cliente': {
    title: 'Área do cliente',
    href: withBase('minhas-fotos/'),
    backLabel: 'Área do cliente',
  },
  carrinho: { title: 'Carrinho', href: withBase('carrinho/'), backLabel: 'Carrinho' },
};
