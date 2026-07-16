
export const cx = (...classNames: (string | false | null | undefined)[]) =>
    classNames.filter(Boolean).join(' ');
