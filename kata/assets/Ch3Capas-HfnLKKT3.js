import{p as Ae,v as ye,g as s,s as a,c as t,t as P,a as i,e as U,i as O,b as z,d as I,f as c,h as Y,j as T,k as C,w as _e,n as Z,l as Te,m as ee,u as R,A as be,B as Pe,C as ze,o as Ce,q as m,r as ke}from"./index-CcfmB0R5.js";import{T as k,s as se}from"./Term-07yMqgKu.js";import{C as we}from"./CodePane-DnJDkhUM.js";const N=[{id:"tests",level:"specs",name:"Tests",tenants:"tests/e2e/*.test.ts · tests/integration/*.test.ts",role:"Los specs ORQUESTAN: destructuran el fixture, llaman ATCs y añaden aserciones de flujo. Casi no tienen lógica propia.",rules:["Jerarquía: carpeta = módulo → archivo = feature → describe = ticket → test = escenario.","Las aserciones fijas viven dentro del ATC; el spec solo añade las de flujo."],samples:[{title:"tests/integration/auth/user-session.test.ts",sourcePath:"tests/integration/auth/user-session.test.ts",code:`import { expect, test } from '@TestFixture';
import { config } from '@variables';

test.describe('UPEX-100: User session', () => {
  test('UPEX-100: should be able to re-authenticate', async ({ api }) => {
    api.clearAuthToken();

    const credentials = {
      email: config.testUser.email,
      password: config.testUser.password,
    };
    const [response, tokenData] = await api.auth.authenticateSuccessfully(credentials);

    expect(response.status()).toBe(200);
    expect(tokenData.access_token).toBeDefined();
  });
});
`}]},{id:"fixtures",level:"L4",name:"Fixtures",tenants:"TestFixture · ApiFixture · UiFixture",role:"Inyección de dependencias: entregan la caja de herramientas ya armada. El test pide { api }, { ui } o { test } y Playwright construye SOLO lo necesario.",rules:["Construcción lazy: { api } jamás abre navegador.","El fixture conecta los componentes entre sí (ej. propaga el token a todos)."],samples:[{title:"tests/components/ApiFixture.ts",sourcePath:"tests/components/ApiFixture.ts",code:`export class ApiFixture extends ApiBase {
  readonly auth: AuthApi;
  readonly example: ExampleApi;

  constructor(options: TestContextOptions) {
    super(options);
    this.auth = new AuthApi(options);
    this.example = new ExampleApi(options);
  }

  override setAuthToken(token: string) {
    super.setAuthToken(token);
    this.auth.setAuthToken(token);
    this.example.setAuthToken(token);
  }
}
`},{title:"registro en Playwright (lazy — { api } no abre navegador)",sourcePath:"tests/components/TestFixture.ts",code:`export const test = base.extend<{
  test: TestFixture
  api: ApiFixture
  ui: UiFixture
}>({
  test: async ({ page, request }, use) => {
    await use(new TestFixture(page, request));
  },
  ui: async ({ page, request }, use) => {
    await use(new UiFixture({ page, request }));
  },
  api: async ({ request }, use) => {
    await use(new ApiFixture({ request }));
  },
});
`}]},{id:"dominio",level:"L3",name:"Dominio",tenants:"AuthApi · LoginPage · CheckoutPage",role:"La lógica de negocio de CADA recurso o página. AQUÍ viven los ATCs, decorados con @atc('TICKET-ID').",rules:["Acción que cambia estado = ATC (@atc); helper de solo lectura = @step (sin ID, no se reporta al TMS).","Locators inline dentro del ATC; se extraen solo si se usan en 2+ ATCs."],chainNode:"AuthApi",samples:[{title:"tests/components/api/AuthApi.ts — un ATC completo",sourcePath:"tests/components/api/AuthApi.ts",code:`@atc('PROJ-101')
async authenticateSuccessfully(
  credentials: LoginPayload,
): Promise<[APIResponse, TokenResponse, LoginPayload]> {
  // ACTION: POST login credentials
  const [response, body, sentPayload] = await this.apiPOST<TokenResponse, LoginPayload>(
    this.config.auth.loginEndpoint,
    credentials,
  );

  // Fixed assertions - validates successful authentication
  expect(response.status()).toBe(200);
  expect(body.access_token).toBeDefined();
  expect(body.token_type).toBe('Bearer');
  expect(body.expires_in).toBeGreaterThan(0);

  // Store token for subsequent requests
  this.setAuthToken(body.access_token);

  // VERIFICATION: Confirm the session is valid via GET /auth/me
  const [meResponse, meBody] = await this.getCurrentUser();
  expect(meResponse.status()).toBe(200);
  expect(meBody.user.email).toBe(credentials.email);

  return [response, body, sentPayload];
}
`}]},{id:"steps",level:"L3.5",name:"Steps (entrepiso)",tenants:"AuthSteps…",role:"Cadenas de ATCs para preparación reutilizable (cuando 3+ ATCs se repiten en 3+ tests). No lleva @atc: no se reporta al TMS.",rules:["Un ATC NUNCA llama a otro ATC — las cadenas viven aquí, en Steps.","Sin @atc: los Steps preparan escenarios, no declaran casos de prueba."],samples:[{title:"AuthSteps — cadena de ATCs SIN @atc (doctrina)",sourcePath:".agents/skills/test-automation/references/kata-architecture.md",code:`export class AuthSteps {
  constructor(private ui: UiFixture, private api: ApiFixture) {}

  async setupAuthenticatedUser(credentials: Credentials) {
    await this.ui.auth.loginWithValidCredentials(credentials);
    await this.ui.profile.completeOnboardingSuccessfully();
    await this.ui.settings.enableFeatureFlagSuccessfully();
  }
}
`}]},{id:"bases",level:"L2",name:"Bases",tenants:"ApiBase (HTTP) · UiBase (Playwright)",role:"Helpers técnicos: ApiBase ofrece métodos HTTP tipados que devuelven tuplas; UiBase, helpers de navegador (intercepción de red, esperas por condición).",rules:["Contrato de tuplas: GET/DELETE → [respuesta, cuerpo]; POST/PUT/PATCH → [respuesta, cuerpo, payloadEnviado].","Fail-fast en público: si pides page sin fixture UI, UiBase lanza un error descriptivo."],chainNode:"ApiBase",samples:[{title:"tests/components/ApiBase.ts — apiPOST (fragmento)",sourcePath:"tests/components/ApiBase.ts",code:`async apiPOST<TBody, TPayload>(
  endpoint: string,
  data: TPayload,
  options: RequestOptions = {},
): Promise<[APIResponse, TBody, TPayload]> {
  const url = this.apiEndpoint(endpoint);
  const headers = this.buildHeaders(options.headers);

  const response = await this.request.post(url, { headers, data, params: options.params });
  const body = await this.getResponseJsonObject<TBody>(response);

  await attachRequestResponseToAllure({ url: endpoint, method: 'POST', responseBody: body, requestBody: data });

  return [response, body, data];
}
`},{title:"tests/components/UiBase.ts — el guardián fail-fast",sourcePath:"tests/components/UiBase.ts",code:`get page(): Page {
  if (!this._page) {
    throw new Error(
      'Page is not available. UiBase requires a page instance. '
      + 'Make sure you are using a UI fixture (ui or test), not api.',
    );
  }
  return this._page;
}
`}]},{id:"contexto",level:"L1",name:"TestContext",tenants:"config · faker · entorno",role:"Los cimientos agnósticos: qué entorno, qué credenciales, qué datos falsos — sin nada de Playwright ni HTTP.",rules:["Agnóstico total: si mencionara Playwright o HTTP, ya no sería el cimiento.","Cada test genera sus propios datos (faker) — nada de estado compartido."],chainNode:"TestContext",samples:[{title:"tests/components/TestContext.ts — la clase completa",sourcePath:"tests/components/TestContext.ts",code:`export class TestContext {
  protected readonly _page?: Page;
  protected readonly _request?: APIRequestContext;
  readonly env: Environment;
  readonly config = config;
  static readonly data = DataFactory;

  constructor(options: TestContextOptions = {}) {
    this._page = options.page;
    this._request = options.request;
    this.env = options.environment ?? env.current;
  }

  get data(): typeof DataFactory {
    return TestContext.data;
  }
}
`}]}],Be=["AuthApi","ApiBase","TestContext"];var qe=m('<span class="ext svelte-nu7zxe" aria-hidden="true">─extends→</span>'),Ue=m('<span class="chain-unit svelte-nu7zxe"><!> <code> </code></span>'),Fe=m('<button><span class="level svelte-nu7zxe"> </span> <span class="fname svelte-nu7zxe"> </span> <span class="tenants svelte-nu7zxe"> </span></button>'),Ee=m('<div class="floor-slot svelte-nu7zxe"><button><span class="level svelte-nu7zxe"> </span> <span class="fname svelte-nu7zxe"> </span> <span class="tenants svelte-nu7zxe"> </span></button> <!></div>'),Se=m('<li class="svelte-nu7zxe"> </li>'),Le=m('<article class="room svelte-nu7zxe"><header class="svelte-nu7zxe"><span class="tag svelte-nu7zxe"> </span> <h3 class="svelte-nu7zxe"> </h3></header> <p class="role svelte-nu7zxe"> </p> <ul class="blist svelte-nu7zxe"></ul> <!></article>'),$e=m(`<div class="room-hint svelte-nu7zxe"><span class="hint-arrow svelte-nu7zxe" aria-hidden="true">←</span> <span class="hint-tap svelte-nu7zxe" aria-hidden="true">pulsa un piso ↑</span> <p class="svelte-nu7zxe">Elige un piso del edificio para entrar. Cada habitación muestra su rol, sus reglas y el
            código REAL del boilerplate que vive ahí.</p></div>`),Oe=m(`<div class="chapter-body svelte-nu7zxe"><section class="intro svelte-nu7zxe"><p class="kicker svelte-nu7zxe">¿por qué capas?</p> <h2 class="svelte-nu7zxe">Un edificio donde cada piso tiene UN trabajo</h2> <p class="prose svelte-nu7zxe">KATA organiza el código de pruebas como un edificio. Cada piso es un <!> con una sola responsabilidad, y la regla de circulación es
      estricta: un piso superior usa al de abajo — nunca al revés. Los cimientos no saben nada de
      los tests; los tests lo saben todo de los cimientos.</p> <p class="prose svelte-nu7zxe">El ascensor entre pisos es la <!>: cada <!> de dominio nace encima de su base y recibe gratis todos sus <!> (<code class="svelte-nu7zxe">AuthApi extends ApiBase extends TestContext</code>).
      Y en la azotea, el <!> entrega el edificio entero, ya armado, a
      cada test. Elige un piso para entrar a su habitación.</p></section> <section class="tour svelte-nu7zxe"><div class="left svelte-nu7zxe"><div class="chain svelte-nu7zxe" aria-label="Cadena de herencia entre capas"><span class="chain-kicker svelte-nu7zxe">cadena de herencia</span> <div class="chain-row svelte-nu7zxe"></div></div> <div class="building svelte-nu7zxe" role="group" aria-label="El edificio KATA, piso por piso"><div class="roof svelte-nu7zxe" aria-hidden="true"></div> <!> <div class="ground svelte-nu7zxe" aria-hidden="true"></div></div></div> <div class="room-col svelte-nu7zxe" aria-live="polite"><!></div></section> <section class="svelte-nu7zxe"><div class="callout good svelte-nu7zxe"><strong class="svelte-nu7zxe">La regla de oro de dirección: una capa superior usa a la inferior, nunca al revés.</strong> TestContext no sabe qué es un test. ApiBase no sabe qué es AuthApi. Por eso, cambiar un piso
      de arriba jamás agrieta los cimientos.</div></section></div>`);function je(te,ae){Ae(ae,!0);const j=typeof window<"u"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,p=e=>j?0:e;let g=ee(null);const v=R(()=>N.find(e=>e.id===s(g))??null),ne=R(()=>N.filter(e=>e.id!=="steps")),F=R(()=>N.find(e=>e.id==="steps"));let w=ee(null);function D(e){Z(g,s(g)===e?null:e,!0)}ye(()=>{!s(v)||!s(w)||window.matchMedia("(max-width: 900px)").matches&&s(w).scrollIntoView({block:"start",behavior:j?"auto":"smooth"})});var H=Oe(),E=t(H),M=a(t(E),4),oe=a(t(M));k(oe,{t:"módulo",children:(e,n)=>{var o=P("módulo");i(e,o)},$$slots:{default:!0}});var ie=a(M,2),G=a(t(ie));k(G,{t:"herencia",children:(e,n)=>{var o=P("herencia");i(e,o)},$$slots:{default:!0}});var J=a(G,2);k(J,{t:"clase",children:(e,n)=>{var o=P("clase");i(e,o)},$$slots:{default:!0}});var K=a(J,2);k(K,{t:"método",children:(e,n)=>{var o=P("métodos");i(e,o)},$$slots:{default:!0}});var re=a(K,4);k(re,{t:"fixture",children:(e,n)=>{var o=P("fixture");i(e,o)},$$slots:{default:!0}});var S=a(E,2),V=t(S),Q=t(V),le=a(t(Q),2);U(le,22,()=>Be,e=>e,(e,n,o)=>{var h=Ue(),r=t(h);{var f=d=>{var _=qe();i(d,_)};O(r,d=>{s(o)>0&&d(f)})}var x=a(r,2);let A;var y=t(x);z(()=>{var d;A=I(x,1,"node svelte-nu7zxe",null,A,{lit:((d=s(v))==null?void 0:d.chainNode)===n}),c(y,n)}),i(e,h)});var ce=a(Q,2),de=a(t(ce),2);U(de,19,()=>s(ne),e=>e.id,(e,n,o)=>{var h=Ee(),r=t(h);let f;var x=t(r),A=t(x),y=a(x,2),d=t(y),_=a(y,2),L=t(_),B=a(r,2);{var $=l=>{var u=Fe();let b;var q=t(u),xe=t(q),W=a(q,2),me=t(W),ge=a(W,2),fe=t(ge);z(()=>{b=I(u,1,"floor mezzanine svelte-nu7zxe",null,b,{active:s(g)==="steps"}),se(u,"aria-pressed",s(g)==="steps"),c(xe,s(F).level),c(me,s(F).name),c(fe,s(F).tenants)}),Y("click",u,()=>D("steps")),i(l,u)};O(B,l=>{s(n).id==="dominio"&&l($)})}z(()=>{f=I(r,1,"floor svelte-nu7zxe",null,f,{active:s(g)===s(n).id}),se(r,"aria-pressed",s(g)===s(n).id),c(A,s(n).level),c(d,s(n).name),c(L,s(n).tenants)}),Y("click",r,()=>D(s(n).id)),T(5,h,()=>C,()=>({y:-10,duration:p(350),delay:p(200+s(o)*90)})),i(e,h)});var X=a(V,2),ue=t(X);{var pe=e=>{var n=be(),o=Pe(n);ze(o,()=>s(v).id,h=>{var r=Le(),f=t(r),x=t(f),A=t(x),y=a(x,2),d=t(y),_=a(f,2),L=t(_),B=a(_,2);U(B,20,()=>s(v).rules,l=>l,(l,u)=>{var b=Se(),q=t(b);z(()=>c(q,u)),i(l,b)});var $=a(B,2);U($,17,()=>s(v).samples,l=>l.title,(l,u)=>{we(l,{get code(){return s(u).code},get title(){return s(u).title}})}),z(()=>{c(A,s(v).level),c(d,s(v).name),c(L,s(v).role)}),T(1,r,()=>C,()=>({x:18,duration:p(320)})),i(h,r)}),i(e,n)},ve=e=>{var n=$e();T(3,n,()=>Ce,()=>({duration:p(200)})),i(e,n)};O(ue,e=>{s(v)?e(pe):e(ve,-1)})}_e(X,e=>Z(w,e),()=>s(w));var he=a(S,2);T(5,E,()=>C,()=>({y:18,duration:p(450)})),T(5,S,()=>C,()=>({y:18,duration:p(450),delay:p(140)})),T(5,he,()=>C,()=>({y:18,duration:p(450),delay:p(260)})),i(te,H),Te()}ke(["click"]);export{je as default};
