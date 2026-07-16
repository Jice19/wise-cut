/* */
import type { MouseEvent, PropsWithChildren } from 'react';

type ClientRouteLinkProps = PropsWithChildren<{
    className?: string;
    href: string;
}>;

const shouldUseBrowserNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    return (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.currentTarget.target === '_blank'
    );
};

export const ClientRouteLink = ({
    children,
    className,
    href
}: ClientRouteLinkProps) => {
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (shouldUseBrowserNavigation(event)) return;

        const nextUrl = new URL(href, window.location.href);

        if (nextUrl.origin !== window.location.origin) return;

        event.preventDefault();
        window.history.pushState({}, '', nextUrl.pathname + nextUrl.search);
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    return (
        <a
            href={href}
            data-client-route="true"
            className={className}
            onClick={handleClick}
        >
            {children}
        </a>
    );
};
