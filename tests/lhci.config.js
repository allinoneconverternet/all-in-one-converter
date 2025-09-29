module.exports = {
  ci: {
    collect: {
      url: ["http://127.0.0.1:5173/","http://127.0.0.1:5173/convert/"],
      startServerCommand: "node scripts/mini-static-server.js 5173",
      numberOfRuns: 1
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.9 }],
        "metrics:first-contentful-paint": ["warn", { maxNumericValue: 2000 }],
        "metrics:cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "metrics:interactive": ["warn", { maxNumericValue: 4000 }]
      }
    }
  }
};


