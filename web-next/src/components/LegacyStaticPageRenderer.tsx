type LegacyStaticPageRendererProps = {
  stylesheetHrefs: string[];
  inlineStyles: string[];
  bodyMarkup: string;
  scriptSrcs?: string[];
  inlineScripts?: string[];
};

export function LegacyStaticPageRenderer({
  stylesheetHrefs,
  inlineStyles,
  bodyMarkup,
  scriptSrcs = [],
  inlineScripts = [],
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
      {scriptSrcs.map((src) => (
        <script key={src} src={src} />
      ))}
      {inlineScripts.map((code, index) => (
        <script
          key={`legacy-inline-script-${index + 1}`}
          dangerouslySetInnerHTML={{ __html: code }}
        />
      ))}
    </>
  );
}
