'use client';
import {useLocale} from './locale';

import type {LucideIcon} from 'lucide-react';
/** Decorative companion to a visible button label; never an independent hit target. */
export default function WorkspaceIcon({icon:Icon}:{icon:LucideIcon}){const {ui,language}=useLocale();
 return <span className="workspace-icon" aria-hidden="true"><Icon size={24} strokeWidth={1.8} focusable="false"/></span>;
}
