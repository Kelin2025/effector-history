module.exports = {
  plugins: [
    [
      'effector/babel-plugin',
      {
        factories: ['./src/index.ts'],
      },
    ],
  ],
};
