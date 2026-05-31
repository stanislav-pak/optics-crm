import { useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './useAuth';

export interface LabelField {
  key: string;
  label: string;
  enabled: boolean;
  customText?: string;
}

export interface LabelTemplate {
  id: string;
  branch_id: string;
  name: string;
  fields: LabelField[];
  size: '40x25' | '50x30' | '58x40';
  is_default: boolean;
}

export function useLabelTemplates() {
  const { employee } = useAuth();
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTemplates = useCallback(async () => {
    if (!employee?.branch_id) return;
    setLoading(true);
    const { data } = await supabase
      .from('label_templates')
      .select('*')
      .eq('branch_id', employee.branch_id)
      .order('name');
    setTemplates((data ?? []) as LabelTemplate[]);
    setLoading(false);
  }, [employee?.branch_id]);

  const saveTemplate = useCallback(async (
    name: string,
    fields: LabelField[],
    size: LabelTemplate['size'],
  ) => {
    if (!employee?.branch_id) return;
    const { error } = await supabase.from('label_templates').insert({
      branch_id: employee.branch_id,
      name,
      fields,
      size,
      is_default: false,
    });
    if (!error) await loadTemplates();
  }, [employee?.branch_id, loadTemplates]);

  const deleteTemplate = useCallback(async (id: string) => {
    await supabase.from('label_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  return { templates, loading, loadTemplates, saveTemplate, deleteTemplate };
}
