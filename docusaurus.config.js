// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'VLA 真机部署侧 Demo',
  tagline: '把 VLA 输出接到 100 Hz 控制器，并把"真的跟随"变成可断言指标',
  favicon: undefined,
  url: 'https://coisini-duck.github.io',
  baseUrl: '/vla-deploy-docs/',
  organizationName: 'Coisini-duck',
  projectName: 'vla-deploy-docs',
  trailingSlash: false,
  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/', // 纯文档站：站点根就是文档
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: false,
        theme: {
          customCss: undefined,
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'VLA 部署 Demo',
        items: [
          { to: '/', label: '文档', position: 'left' },
          { to: '/verification', label: '验证', position: 'left' },
          { to: '/onnx', label: 'ONNX 实验', position: 'left' },
        ],
      },
      footer: {
        style: 'dark',
        copyright: `本地构建 · ROS 2 Jazzy + SmolVLA + ros2_control`,
      },
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      prism: { additionalLanguages: ['bash', 'python', 'cpp'] },
    }),
};

module.exports = config;
