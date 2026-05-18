# Fix App.tsx - simple onBack + clean swipe handler
content = open('src/App.tsx', encoding='utf-8').read()

# Revert onBack to simple handleBack
content = content.replace(
    'onBack={() => { if (mobileViewRef.current === \'crm\') setMobileView(\'chat\'); else handleBackRef.current(); }}',
    'onBack={handleBack}'
)

# Fix swipe - use setState directly, no stale closure
old = '''      if (dy < 120 && dx > 40) {
        if (swipeRef.current.x < 50) {
          if (activeChatRef.current) handleBackRef.current();
        } else {
          if (mobileViewRef.current === 'crm') setMobileView('chat');
          else if (mobileViewRef.current === 'chat' && activeChatRef.current) handleBackRef.current();
        }
      }'''
new = '''      if (dx > 50 && dy < 100) {
        if (mobileViewRef.current === 'crm') setMobileView('chat');
        else if (mobileViewRef.current === 'chat' && activeChatRef.current) {
          setActiveChat(null);
          setMobileView('list');
        }
      }'''
content = content.replace(old, new)
print('App fixed:', old not in content)
open('src/App.tsx', 'w', encoding='utf-8').write(content)

# Remove swipe from CRMSidebar
content2 = open('src/components/CRM/CRMSidebar.tsx', encoding='utf-8').read()
old2 = '''  useEffect(() => {
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
content2 = content2.replace(old2, '')
print('CRM swipe removed:', old2 not in content2)
open('src/components/CRM/CRMSidebar.tsx', 'w', encoding='utf-8').write(content2)
