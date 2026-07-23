import createMDX from '@next/mdx';

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  pageExtensions: ['ts', 'tsx', 'mdx'],
  sassOptions: {
    includePaths: ['./src'],
  },
  webpack(config) {
    // Console components import from react-router-dom; back it with Next.js.
    config.resolve.alias['react-router-dom'] = new URL('./src/lib/router-shim.tsx', import.meta.url)
      .pathname;

    // Logto console components import icons as `foo.svg?react` (SVGR).
    const fileLoaderRule = config.module.rules.find((rule) => rule.test?.test?.('.svg'));
    config.module.rules.push(
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: {
          ...fileLoaderRule.resourceQuery,
          not: [...fileLoaderRule.resourceQuery.not, /react/],
        },
      },
      {
        test: /\.svg$/i,
        resourceQuery: /react/,
        use: ['@svgr/webpack'],
      }
    );
    fileLoaderRule.exclude = /\.svg$/i;
    return config;
  },
};

export default withMDX(nextConfig);
