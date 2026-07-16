
export const navigateToClientRoute = (href: string) => {
    if (typeof window === 'undefined') return;

    const nextUrl = new URL(href, window.location.href);

    if (nextUrl.origin !== window.location.origin) return;

    window.history.pushState({}, '', nextUrl.pathname + nextUrl.search);
    window.dispatchEvent(new PopStateEvent('popstate'));
};
