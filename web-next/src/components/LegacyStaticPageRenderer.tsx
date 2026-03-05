type LegacyStaticPageRendererProps = {
  stylesheetHrefs: string[];
  inlineStyles: string[];
  bodyMarkup: string;
};

export function LegacyStaticPageRenderer({
  stylesheetHrefs,
  inlineStyles,
  bodyMarkup,
}: LegacyStaticPageRendererProps) {
  return (
    <>
      {stylesheetHrefs.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      {inlineStyles.map((css, index) => (
        <style
          key={`legacy-inline-style-${index + 1}`}
          dangerouslySetInnerHTML={{ __html: css }}
        />
      ))}
      <div
        className="legacy-static-page-root"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: bodyMarkup }}
      />
    </>
  );
}
