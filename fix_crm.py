content = open('src/components/CRM/CRMSidebar.tsx', encoding='utf-8').read()
content = content.replace('interface CRMSidebarProps {', 'interface CRMSidebarProps {\n  onBack?: () => void;')
old = 'export function CRMSidebar({ chat }: CRMSidebarProps) {'
new = '''export function CRMSidebar({ chat, onBack }: CRMSidebarProps) {
  useEffect(() => {
    if (!onBack) return;
    let sx = 0, sy = 0;
    const t0 = (e: TouchEvent) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
    const t1 = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = Math.abs(e.changedTouches[0].clientY - sy);
      if (dx > 50 && dy < 100) onBack();
    };
    document.addEventListener('touchstart', t0, { passive: true });
    document.addEventListener('touchend', t1, { passive: true });
    return () => { document.removeEventListener('touchstart', t0); document.removeEventListener('touchend', t1); };
  }, [onBack]);'''
content = content.replace(old, new)
print('onBack in file:', 'onBack' in content)
open('src/components/CRM/CRMSidebar.tsx', 'w', encoding='utf-8').write(content)

content2 = open('src/App.tsx', encoding='utf-8').read()
result2 = content2.replace('<CRMSidebar chat={activeChat} />', '<CRMSidebar chat={activeChat} onBack={() => setMobileView("chat")} />')
print('App:', 'Found' if result2 != content2 else 'NOT FOUND')
open('src/App.tsx', 'w', encoding='utf-8').write(result2)
