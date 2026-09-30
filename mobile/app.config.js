module.exports = ({ config }) => {
  // Only production builds enforce strict HTTPS. Local dev and preview allow HTTP cleartext.
  const isProduction = process.env.EAS_BUILD_PROFILE === 'production';

  return {
    ...config,
    android: {
      ...(config.android || {}),
      usesCleartextTraffic: !isProduction,
      permissions: [
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
      ],
    },
  };
};
