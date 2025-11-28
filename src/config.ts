// config.ts
export const Config: Record<string, string> = {
  // Auth
  "auth.check": "https://cryspprod3.quantag-it.com:444/api10/check_token_ready",
  "auth.start": "https://cryspprod3.quantag-it.com:444/api10/google-auth-start",

  // File / session management
  "prepare.data": "https://cryspprod3.quantag-it.com:444/api2/public/prepareData",
  "submit.files": "https://cryspprod3.quantag-it.com:444/api2/public/submitFiles",
  "get.image": "https://cryspprod3.quantag-it.com:444/api2/public/getImage",
  "get.file": "https://cryspprod3.quantag-it.com:444/api2/public/getFile",

  // CUDA-Q
  "cudaq.run": "https://cryspprod3.quantag-it.com:444/api19/cudaq/run",

  // Transpiler
  "transpile": "https://cryspprod3.quantag-it.com:444/api15/transpile",

  // PyZX
  "pyzx.optimize": "https://cryspprod3.quantag-it.com:444/api16/optimize",
  "pyzx.render": "https://cryspprod3.quantag-it.com:444/api16/render",
   "pyzx.render2": "https://cryspprod3.quantag-it.com:444/api16/rend",

  // Backends
  "ibmq.submit": "https://quantum.quantag-it.com/api5/submit_ibm_job",
  "zi.run": "https://cryspprod2.quantag-it.com:4043/api2/run",
  "qvm.submit": "https://quantum.quantag-it.com/api5/qvm/submit",

  // Compiler
  "qasm2qir": "https://api.quantag-it.com/qasm2qir",

  // Web frontend
  "circuit.web": "https://quantag-it.com/quantum/#/qcd?id=",

  "getuser.by_googleid": "https://quantum.quantag-it.com/api5/getuser_by_googleid",
  "bqskit.optimize" : "https://cloud.quantag-it.com/api4/optimize",

  "get.config": "https://quantum.quantag-it.com/api5/get_config"
};
// helper to update config dynamically
export function updateConfig(newCfg: Record<string, string>) {
  for (const [k, v] of Object.entries(newCfg)) {
    Config[k] = v;
  }
}