// Közös böngésző: a szoba böngésző-munkamenetének mezői.
import { isRecord, isString } from '../../../shared/lib/guards';

export type BrowserControlMode = 'free' | 'controller';

export interface BrowserController {
  id: string;
  username?: string;
  color?: string;
}

export interface BrowserSession {
  active?: boolean;
  currentUrl?: string;
  isLoading?: boolean;
  controlMode?: BrowserControlMode;
  controller?: BrowserController | null;
  viewerCount?: number;
  title?: string;
}

const optional = (value: unknown, type: 'string' | 'number' | 'boolean'): boolean => value === undefined || typeof value === type;

const isController = (value: unknown): value is BrowserController | null | undefined =>
  value === undefined || value === null || (isRecord(value) && isString(value.id) && optional(value.username, 'string') && optional(value.color, 'string'));

export const isBrowserSession = (value: unknown): value is BrowserSession =>
  isRecord(value) && optional(value.active, 'boolean') && optional(value.currentUrl, 'string') && optional(value.isLoading, 'boolean')
  && (value.controlMode === undefined || value.controlMode === 'free' || value.controlMode === 'controller')
  && isController(value.controller) && optional(value.viewerCount, 'number') && optional(value.title, 'string');
