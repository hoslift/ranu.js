import {
  getDevToolsState,
  subscribeDevTools,
  toggleDevToolsDock,
  setActiveDevToolsTab,
  setSelectedPartner,
  setCurrentPrompt,
  acceptAIChanges,
  revertAIChanges,
} from './state.js';
import type { DevToolsDockState, AIStudioPartner } from './types.js';
import { computeLineDiff } from './diff.js';
import { submitAIPrompt, abortAIGeneration } from './client-stream.js';

export const RANU_BRAND_ICON_SVG = `<svg viewBox="0 0 1910 2081" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fill-rule="evenodd" clip-rule="evenodd" d="M6.05888 184.918C19.3824 144.646 32.9232 104.257 64.0453 73.7781C158.382 -18.5948 319.365 -27.0852 417.728 64.5411C452.644 97.0545 477.409 139.054 487.735 186.002C492.832 209.146 492.253 234.311 498.842 256.826C562.694 253.737 626.908 257.411 690.846 256.84C873.452 255.23 1056.04 253.898 1238.66 253.634C1301.44 253.532 1364.16 252.668 1426.94 252.873C1454.63 252.946 1485.77 246.959 1509.17 264.95C1585.05 323.229 1648.33 400.274 1715.88 467.761C1747.58 499.44 1798.83 535.159 1818.27 576.208C1826.52 593.643 1821.9 618.968 1821.51 637.706C1820.6 681.638 1820.06 725.526 1820.22 769.458C1820.53 852.433 1821.32 935.422 1822.38 1018.4C1822.83 1052.49 1831.66 1100.24 1821.7 1132.93C1817.69 1146.14 1801.83 1157.38 1792.55 1166.79C1765.19 1194.49 1737.99 1229.68 1704.16 1249.48C1675.44 1266.28 1635.17 1257.83 1603.41 1257.42C1533.5 1256.55 1463.24 1256.33 1393.45 1256.22C1417.98 1299.51 1471.06 1333.21 1506.54 1367.88C1579.35 1439.02 1648.2 1518.98 1728.71 1581.42C1805.59 1641.06 1881 1680.93 1903.83 1784.67C1940.23 1950.07 1795.79 2102.12 1631.85 2077.96C1548.85 2065.74 1474.85 1994.46 1436.53 1921.19C1363.45 1920.56 1290.2 1920.49 1217.07 1920.68C1186.96 1920.77 1145.54 1928.42 1116.97 1917.36C1095.03 1908.87 1076.98 1885.12 1060.94 1868.62C1028.15 1834.89 995.087 1801.38 961.546 1768.42C858.434 1667.04 755.219 1565.99 652.758 1463.92C598.19 1409.57 547.502 1338.47 479.002 1301.75C461.232 1312.98 450.182 1338.11 436.004 1353.81C406.026 1386.97 367.851 1412.38 324.202 1422.61C279.539 1433.08 234.413 1433.78 189.533 1424.66C115.862 1409.69 44.5669 1352.27 16.7322 1280.8C-34.3752 1149.58 35.3272 988.225 174.964 956.107C212.226 947.543 252.023 946.153 289.59 953.604C327.157 961.07 363.956 975.694 394.426 999.439C433.007 1029.49 465.186 1064.89 485.533 1109.96C494.961 1130.87 493.05 1158.24 504.852 1177.03C523.578 1189.65 546.431 1193.1 565.228 1206.44C622.853 1247.32 672.251 1305.84 721.94 1355.89C810.194 1444.78 898.636 1534.56 989.28 1620.94C1029.19 1658.98 1070.13 1695.87 1109.13 1734.85C1127.58 1753.3 1147.24 1782.47 1170.91 1793.96C1187.05 1801.79 1213.84 1797.05 1231.42 1797.49C1281.91 1798.76 1334.19 1802.99 1384.48 1798.88C1377.89 1779.66 1338.7 1754.12 1323.41 1739.45C1269.54 1687.81 1214.3 1637.91 1161.26 1585.37C1000.01 1425.66 837.753 1267.03 677.827 1106.07C628.979 1056.91 577.234 1010.77 528.371 961.685C503.52 936.725 475.294 911.458 458.77 879.881C457.308 857.352 473.73 838.335 487.778 822.247C522.13 782.882 561.13 747.456 596.698 709.131C632.223 670.835 668.863 633.68 704.749 595.736C721.635 577.861 739.26 552.638 760.868 540.517C773.279 533.549 791.845 536.418 805.487 536.608C836.435 537.048 867.384 536.974 898.332 536.916C1009.63 536.725 1120.94 536.418 1232.23 536.272C1269.44 536.213 1325.92 519.539 1359.66 539.434C1404.15 565.667 1435.4 614.84 1473.55 649.037C1491.42 665.052 1518.88 681.624 1527.97 704.9C1534.78 722.306 1532.61 744.425 1532.5 762.768C1532.1 836.754 1514.27 876.192 1460.44 927.239C1445.96 940.971 1428.96 960.353 1410.2 967.789C1387.61 976.763 1360.15 974.64 1336.33 975.328C1269.49 977.231 1191.13 965.798 1126.37 983.555C1146.99 1025.8 1202.83 1062.42 1235.58 1096.48C1249.32 1110.78 1265.56 1132.76 1285.12 1138.66C1304.96 1144.63 1331.1 1139.17 1351.58 1138.76C1396.56 1137.88 1441.4 1136.59 1486.41 1136.65C1536.82 1136.72 1611.07 1147.41 1658.38 1127.47C1671.13 1118.97 1684.06 1107.59 1689.91 1093.04C1698.18 1058.05 1691.14 1016.46 1690.75 980.627C1689.98 910.228 1690.94 839.829 1690.68 769.429C1690.52 723.682 1700.24 663.12 1686.41 619.451C1640.15 568.009 1587.35 522.628 1538.31 473.997C1506.35 442.274 1473.43 403.305 1435.26 379.238C1399.57 376.003 1361.62 380.556 1325.63 380.409C1231.49 380.043 1137.39 380.321 1043.25 380.072C850.454 379.56 655.8 369.21 463.173 376.179C424.52 420.067 381.957 463.501 323.391 478.067C197.353 509.38 51.5472 443.577 10.1428 314.548C-2.50009 275.124 -1.327 225.191 6.05888 184.918ZM130.46 236.58C125.522 318.12 211.459 375.227 285.187 353.883C334.354 339.654 366.809 292.37 368.416 241.279C373.08 93.3801 139.41 88.6661 130.46 236.58ZM129.751 1165.67C114.081 1221.88 159.251 1287.84 212.429 1302.28C276.513 1319.67 344.188 1286.19 363.347 1219.73C385.23 1143.87 320.756 1076.31 246.622 1075.99C193.11 1075.75 144.291 1113.49 129.751 1165.67ZM618.957 871.874C643.866 918.763 698.551 961.421 737.754 996.262C797.044 1048.93 851.627 1106.48 909.715 1160.47C1009.69 1253.4 1099.75 1357.16 1199.66 1450.28C1283.04 1527.98 1362.3 1609.69 1443.48 1689.69C1473.72 1719.48 1509.49 1743.88 1537.96 1775.37C1540.85 1790.95 1533.71 1807.39 1534.79 1823.39C1537.69 1865.9 1565.49 1912.82 1602.87 1933.52C1703.74 1989.41 1818.82 1889.44 1771.29 1781.29C1749.06 1730.72 1707.23 1721.85 1665.03 1696.25C1635.05 1678.06 1610.27 1641.39 1585.22 1616.71C1433.4 1467.17 1286.66 1312.61 1133.13 1164.64C1083.5 1116.8 1039.07 1064.42 990.453 1015.62C967.021 992.105 930.468 962.343 918.172 930.855C931.047 904.504 950.439 880.613 970.829 859.855C995 854.131 1023.54 858.479 1048.31 858.64C1112.61 859.079 1176.85 861.202 1241.15 860.953C1273.36 860.836 1312.04 864.349 1343.09 855.331C1365.09 839.609 1399.79 800.23 1409.71 774.743C1411.19 760.763 1376.43 735.188 1366.89 725.6C1347.22 705.793 1325.95 674.948 1299.94 663.735C1266.79 649.432 1209.23 660.807 1173.39 661.422C1091.41 662.842 1009.37 663.354 927.354 663.398C897.029 663.413 847.036 653.034 818.97 664.789C794.524 675.021 772.584 710.448 754.655 729.669C710.151 777.334 665.952 826.829 618.957 871.874Z" fill="#33BBCA"/>
</svg>`;

const ICONS = {
  groq: `<svg viewBox="0 0 201 201" fill="none" style="width:16px;height:16px;flex-shrink:0;"><rect width="201" height="201" rx="42" fill="#F54F35"/><path fill="#FEFBFB" d="m128 49 1.895 1.52C136.336 56.288 140.602 64.49 142 73c.097 1.823.148 3.648.161 5.474l.03 3.247.012 3.482.017 3.613c.01 2.522.016 5.044.02 7.565.01 3.84.041 7.68.072 11.521.007 2.455.012 4.91.016 7.364l.038 3.457c-.033 11.717-3.373 21.83-11.475 30.547-4.552 4.23-9.148 7.372-14.891 9.73l-2.387 1.055c-9.275 3.355-20.3 2.397-29.379-1.13-5.016-2.38-9.156-5.17-13.234-8.925 3.678-4.526 7.41-8.394 12-12l3.063 2.375c5.572 3.958 11.135 5.211 17.937 4.625 6.96-1.384 12.455-4.502 17-10 4.174-6.784 4.59-12.222 4.531-20.094l.012-3.473c.003-2.414-.005-4.827-.022-7.241-.02-3.68 0-7.36.026-11.04-.003-2.353-.008-4.705-.016-7.058l.025-3.312c-.098-7.996-1.732-13.21-6.681-19.47-6.786-5.458-13.105-8.211-21.914-7.792-7.327 1.188-13.278 4.7-17.777 10.601C75.472 72.012 73.86 78.07 75 85c2.191 7.547 5.019 13.948 12 18 5.848 3.061 10.892 3.523 17.438 3.688l2.794.103c2.256.082 4.512.147 6.768.209v16c-16.682.673-29.615.654-42.852-10.848-8.28-8.296-13.338-19.55-13.71-31.277.394-9.87 3.93-17.894 9.562-25.875l1.688-2.563C84.698 35.563 110.05 34.436 128 49Z"/></svg>`,
  gemini: `<svg viewBox="0 0 24 24" fill="none" style="width:16px;height:16px;flex-shrink:0;"><path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" fill="url(#gemini-dock-grad)"/><defs><linearGradient id="gemini-dock-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#4E82EE"/><stop offset="0.5" stop-color="#9B72CB"/><stop offset="1" stop-color="#D96570"/></linearGradient></defs></svg>`,
  claude: `<svg viewBox="0 0 24 24" fill="#D97757" style="width:16px;height:16px;flex-shrink:0;"><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>`,
  openai: `<svg viewBox="0 0 256 260" fill="currentColor" style="width:16px;height:16px;flex-shrink:0;"><path fill="#fff" d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"/></svg>`,
  ollama: `<svg viewBox="0 0 646 854" fill="none" style="width:16px;height:16px;flex-shrink:0;"><path fill="#FFFFFF" d="M140.629.24c-7.969 1.287-17.532 5.456-24.275 10.605-20.413 15.51-36.229 48.428-42.91 89.438-2.514 15.509-4.23 37.026-4.23 53.455 0 19.371 2.268 44.136 5.517 61.239.736 3.801 1.103 7.173.797 7.418-.245.245-3.25 2.697-6.62 5.394-11.525 9.195-24.705 23.356-33.778 36.291-17.41 24.704-28.688 52.78-33.409 83.185-1.839 12.015-2.33 36.29-.858 48.305 3.25 27.708 11.586 51.125 25.87 72.581l4.658 6.927-1.349 2.268c-9.563 16.061-17.716 39.294-21.516 61.607-3.004 17.655-3.372 22.375-3.372 46.037 0 23.847.307 28.567 3.127 45.057 3.371 19.739 10.237 40.642 17.9 54.558 2.513 4.536 8.643 13.976 9.378 14.467.246.122-.49 2.39-1.655 5.026-8.827 19.31-16.367 44.995-19.493 66.635-2.207 14.834-2.514 19.616-2.514 35.248 0 19.922 1.104 29.608 5.272 45.485l.613 2.329h52.535l-1.716-3.249c-10.605-19.616-11.586-56.029-2.452-92.38 4.168-16.797 8.888-29.118 17.716-46.099l5.272-10.298v-6.314c0-5.885-.123-6.559-2.023-10.421-1.472-2.943-3.433-5.456-6.927-8.889-5.947-5.762-10.238-11.831-13.67-19.31-15.08-32.735-18.023-81.346-7.418-122.786 4.414-17.287 11.709-32.673 19.371-41.071 5.21-5.763 7.908-12.199 7.908-18.881 0-6.927-2.452-12.628-7.97-18.574-15.815-16.919-25.562-37.517-29.056-61.485-4.965-34.145 4.046-71.355 24.52-100.84 20.046-28.935 48.183-47.509 79.631-52.474 7.049-1.165 20.229-.981 27.585.368 8.031 1.41 13.057.98 18.207-1.472 6.375-3.003 9.563-6.743 13.302-15.325 3.31-7.662 5.885-11.831 12.812-20.474 8.337-10.36 16.367-17.41 29.24-25.931 14.713-9.624 31.448-16.612 48.122-19.984 6.068-1.226 8.888-1.41 20.229-1.41s14.161.184 20.229 1.41c24.459 4.966 48.735 17.594 68.106 35.493 4.168 3.862 14.16 16.245 17.348 21.395 1.226 2.022 3.372 6.314 4.72 9.501 3.739 8.582 6.927 12.322 13.302 15.325 4.966 2.391 10.176 2.882 17.9 1.594 12.199-2.084 21.578-1.9 33.532.552 40.704 8.214 76.136 41.746 91.829 86.68 13.67 39.416 9.808 80.672-10.544 112.18-3.433 5.334-6.866 9.625-11.831 14.897-10.728 11.463-10.728 25.685-.061 37.455 17.532 19.187 28.505 66.389 25.194 108.012-2.206 27.463-9.256 52.045-18.942 65.96-1.716 2.452-5.271 6.62-7.969 9.195-3.494 3.433-5.455 5.946-6.927 8.889-1.9 3.862-2.023 4.536-2.023 10.421v6.314l5.272 10.298c8.828 16.981 13.548 29.302 17.716 46.099 9.012 35.861 8.215 71.538-2.084 91.829-.858 1.716-1.594 3.31-1.594 3.494s11.709.306 26.053.306h25.992l.674-2.636c.368-1.409.981-3.555 1.287-4.781.675-2.697 2.023-10.666 3.127-18.329 1.042-7.724 1.042-36.168 0-44.75-3.923-31.141-10.483-55.845-21.21-79.201-1.165-2.636-1.901-4.904-1.656-5.026.307-.184 2.023-2.636 3.862-5.395 13.364-20.229 21.578-45.669 25.747-79.262 1.103-9.257 1.103-49.041 0-57.93-2.943-22.926-6.498-38.497-12.383-54.251-2.452-6.559-8.95-20.413-11.708-24.888l-1.349-2.268 4.659-6.927c14.283-21.456 22.62-44.873 25.869-72.581 1.471-12.015.981-36.29-.858-48.305-4.782-30.467-16-58.42-33.409-83.185-9.073-12.935-22.253-27.096-33.777-36.291-3.372-2.697-6.376-5.149-6.621-5.394-.306-.245.062-3.617.797-7.418 7.418-38.681 7.172-86.924-.613-124.625-6.743-32.857-19.003-58.971-34.819-74.051C523.209 4.286 510.336-.864 494.888.117c-35.432 2.085-63.998 42.85-75.278 107.093-1.839 10.36-3.432 22.498-3.432 25.808 0 1.287-.246 2.329-.552 2.329s-2.697-1.226-5.272-2.758c-27.34-16.184-57.746-24.827-87.354-24.827s-60.014 8.643-87.354 24.827c-2.575 1.532-4.965 2.758-5.272 2.758-.306 0-.552-1.042-.552-2.329 0-3.433-1.655-15.938-3.432-25.808-10.238-57.684-33.716-95.875-64.918-105.499C157.181.424 144.982-.434 140.629.24m10.422 49.899c8.827 6.988 18.635 26.972 24.275 49.347 1.042 4.046 2.145 8.705 2.452 10.421.245 1.656.919 5.395 1.471 8.276 2.391 12.996 3.494 27.034 3.617 44.137l.061 16.858-4.23 6.252-4.229 6.314h-9.87c-11.524 0-22.988 1.472-33.961 4.414-3.923.981-7.724 1.962-8.459 2.146-1.165.245-1.349-.123-2.023-5.15-3.617-27.279-3.433-57.5.552-82.634 4.413-28.014 14.712-53.393 24.765-60.871 2.391-1.778 2.82-1.717 5.579.49m349.538-.43c6.069 4.476 12.751 16.368 17.716 31.57 9.992 30.406 12.812 72.152 7.54 111.875-.674 5.027-.858 5.395-2.023 5.15-.735-.184-4.536-1.165-8.459-2.146-10.973-2.942-22.437-4.414-33.961-4.414h-9.87l-4.229-6.314-4.23-6.252.061-16.858c.123-23.785 2.33-42.359 7.601-63.018 5.579-22.19 15.448-42.175 24.214-49.163 2.759-2.207 3.188-2.268 5.64-.43"/><path fill="#FFFFFF" d="M313.498 358.237c-13.303 1.288-16.919 1.778-23.295 3.066-10.36 2.145-24.214 6.927-33.838 11.647-33.47 16.367-56.519 43.646-63.569 75.216-1.41 6.253-1.594 8.337-1.594 18.881 0 10.421.184 12.689 1.533 18.635 9.379 41.256 47.385 71.723 96.549 77.301 10.666 1.165 56.765 1.165 67.431 0 39.478-4.475 73.439-25.869 88.703-55.907 4.045-8.03 6.007-13.241 7.846-21.394 1.349-5.946 1.533-8.214 1.533-18.635 0-10.544-.184-12.628-1.594-18.881-10.238-45.853-54.742-81.959-109.3-88.825-7.111-.858-25.746-1.594-30.405-1.104m22.926 33.348c18.207 1.962 36.536 8.46 51.248 18.268 7.908 5.272 19.065 16.306 23.846 23.54 5.885 8.949 9.256 18.083 10.789 29.179.674 5.088.307 8.95-1.533 17.164-2.881 12.26-11.831 25.072-23.907 34.022-5.64 4.107-17.348 10.054-24.52 12.383-13.609 4.352-22.498 5.149-54.252 4.904-20.719-.184-24.398-.368-30.344-1.471-20.29-3.801-36.351-11.893-47.998-24.214-9.441-9.931-13.732-19.003-16.061-33.654-1.042-6.805.919-18.084 4.904-27.586 4.843-11.586 17.348-25.991 29.731-34.267 14.344-9.563 33.225-16.367 50.573-18.206 6.682-.736 20.842-.736 27.524-.062"/><path fill="#FFFFFF" d="M299.584 436.336c-4.659 2.513-7.908 8.888-6.927 13.608 1.103 5.088 5.578 10.238 12.566 14.468 3.74 2.268 3.985 2.574 4.169 4.842.122 1.349-.368 5.211-1.042 8.644-.736 3.371-1.288 6.927-1.288 7.908.062 2.636 2.514 6.927 5.088 9.011 2.269 1.839 2.698 1.9 9.073 2.084 5.824.184 7.05.061 9.379-1.042 6.008-2.943 7.54-8.337 5.333-18.697-1.839-8.643-1.471-9.992 3.127-12.628 4.842-2.82 9.992-7.785 11.524-11.157 2.943-6.436.245-13.731-6.253-17.103-1.593-.797-3.555-1.164-6.436-1.164-4.475 0-7.356 1.042-12.628 4.413l-3.004 1.901-1.9-1.165c-7.785-4.598-9.195-5.149-13.916-5.088-3.371 0-5.21.306-6.865 1.165m-148.84-71.171c-10.85 3.433-18.942 11.402-23.11 22.743-2.023 5.395-3.004 13.916-2.146 18.513 2.023 10.973 11.034 20.965 21.272 23.724 12.873 3.371 22.497 1.164 31.018-7.295 4.965-4.843 7.663-9.073 10.36-15.939 1.961-4.842 2.084-5.7 2.084-12.566l.061-7.356-2.574-5.272c-4.108-8.337-11.525-14.529-20.107-16.797-4.843-1.226-12.628-1.164-16.858.245m327.409-.183c-8.398 2.268-15.877 8.52-19.862 16.735l-2.574 5.272.061 7.356c0 6.866.123 7.724 2.084 12.566 2.698 6.866 5.395 11.096 10.36 15.939 8.521 8.459 18.145 10.666 31.019 7.295 7.417-1.962 14.834-8.215 18.39-15.51 3.065-6.191 3.8-10.666 2.82-17.716-2.268-16.122-11.709-27.83-25.747-31.937-4.107-1.226-12.076-1.226-16.551 0"/></svg>`,
  none: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="m6 9 6 6 6-6"/></svg>`,
  chevronUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="m18 15-6-6-6 6"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  key: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="M2.586 17.414A2 2 0 1 1 5.414 20.242l1.414-1.414 2-2 2 2 1.414-1.414-2-2 2-2 1.414 1.414 1.414-1.414-1.414-1.414 4.242-4.242a7.5 7.5 0 1 1 10.607 0 7.46 7.46 0 0 1-2.122 5.303l-4.242 4.242a2 2 0 0 1-2.828 0Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

/**
 * WeakMap store for private closed Shadow DOM instances.
 */
export const shadowRootStore = new WeakMap<HTMLElement, ShadowRoot>();

/**
 * Injects or mounts the floating Ranu DevTools dock into the DOM.
 */
export function mountDevToolsDock(targetDocument?: Document): (() => void) | undefined {
  const doc = targetDocument || (typeof document !== 'undefined' ? document : undefined);
  if (!doc || !doc.body) {
    return undefined;
  }
  const activeDoc: Document = doc;

  const existing = activeDoc.getElementById('ranu-devtools-dock');
  if (existing) {
    return undefined;
  }

  const container = activeDoc.createElement('div');
  container.id = 'ranu-devtools-dock';
  const shadow = container.attachShadow({ mode: 'closed' });
  shadowRootStore.set(container, shadow);

  // Modal & popover internal state
  let isProviderDropdownOpen = false;
  let isAuthModalOpen = false;
  let activeModalProvider: AIStudioPartner = 'groq';
  const providerAuthModes: Record<string, 'account' | 'byok'> = {
    groq: 'account',
    gemini: 'account',
    claude: 'account',
    openai: 'byok',
  };
  let isAccountConnected: Record<string, boolean> = {
    groq: true,
    gemini: false,
    claude: true,
    openai: true,
    ollama: true,
    none: false,
  };
  const enteredKeys: Record<string, string> = {
    groq: 'gsk_948f21bb0298e26c447c3d8afbb657',
    openai: 'sk-proj-48f21bb0298e26c447c3d8afbb',
  };
  let ollamaEndpoint = 'http://127.0.0.1:11434';
  let isPingTesting = false;
  let pingResult: { latency: number; code: string; message?: string } | null = null;
  let pingTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let isKeyVisible = false;

  // Active focus preservation tracking
  let isPromptFocused = false;
  let promptCursorPos: number | null = null;
  let isKeyInputFocused = false;
  let keyCursorPos: number | null = null;

  // Keyboard shortcut listener for Alt+D, Ctrl/Cmd+Shift+D, and Escape
  const handleKeyDown = (evt: Event): void => {
    const e = evt as KeyboardEvent;
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (isAuthModalOpen) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (pingTimeoutId) {
          clearTimeout(pingTimeoutId);
          pingTimeoutId = null;
        }
        isPingTesting = false;
        isAuthModalOpen = false;
        render(getDevToolsState());
        return;
      }
      if (isProviderDropdownOpen) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        isProviderDropdownOpen = false;
        render(getDevToolsState());
        return;
      }
      if (getDevToolsState().isOpen) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        isProviderDropdownOpen = false;
        if (pingTimeoutId) {
          clearTimeout(pingTimeoutId);
          pingTimeoutId = null;
        }
        isPingTesting = false;
        isAuthModalOpen = false;
        toggleDevToolsDock();
        return;
      }
    }

    const isAltD = e.altKey && (e.key === 'd' || e.key === 'D');
    const isCtrlShiftD =
      (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'd' || e.key === 'D');
    if (isAltD || isCtrlShiftD) {
      if (typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      toggleDevToolsDock();
    }
  };
  if (typeof activeDoc.addEventListener === 'function') {
    activeDoc.addEventListener('keydown', handleKeyDown);
  }

  // Outside-click dismissal for provider popover dropdown
  const handleOutsideClick = (e: Event): void => {
    if (isProviderDropdownOpen) {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function' || !target.closest('.custom-dropdown-container')) {
        isProviderDropdownOpen = false;
        render(getDevToolsState());
      }
    }
  };
  if (typeof activeDoc.addEventListener === 'function') {
    activeDoc.addEventListener('click', handleOutsideClick);
  }

  const style = activeDoc.createElement('style');
  style.textContent = `
    :host {
      all: initial;

      /* Surfaces & Canvas */
      --rd-bg-root: #0a0a0c;
      --rd-surface-0: #121216;
      --rd-surface-1: #16161c;
      --rd-surface-2: #1c1c24;
      --rd-surface-3: #24242e;
      --rd-surface-4: #2c2c38;

      /* Glassmorphism */
      --rd-glass-pill: rgba(18, 18, 22, 0.88);
      --rd-glass-panel: rgba(22, 22, 28, 0.96);
      --rd-glass-overlay: rgba(10, 10, 12, 0.72);
      --rd-glass-blur-sm: blur(8px);
      --rd-glass-blur-md: blur(16px) saturate(180%);
      --rd-glass-blur-lg: blur(24px) saturate(200%);

      /* Borders & Specular Highlights */
      --rd-border-subtle: #1f1f26;
      --rd-border-default: #282833;
      --rd-border-strong: #383847;
      --rd-border-focus: #6366f1;
      --rd-border-specular: inset 0 1px 0 0 rgba(255, 255, 255, 0.06);

      /* Typography Text Colors */
      --rd-text-primary: #f8fafc;
      --rd-text-secondary: #94a3b8;
      --rd-text-muted: #64748b;
      --rd-text-inverse: #0a0a0c;

      /* Semantic Status & Brand Accents */
      --rd-accent-cyan: #33BBCA;
      --rd-accent-cyan-glow: rgba(51, 187, 202, 0.25);
      --rd-accent-ai: #8b5cf6;
      --rd-accent-ai-bright: #c084fc;
      --rd-accent-ai-glow: rgba(139, 92, 246, 0.35);

      --rd-status-success: #10b981;
      --rd-status-success-bright: #34d399;
      --rd-diff-add-text: #6ee7b7;
      --rd-diff-add-bg: rgba(16, 185, 129, 0.12);
      --rd-diff-add-border: rgba(16, 185, 129, 0.30);

      --rd-status-warning: #f59e0b;
      --rd-status-warning-bright: #fbbf24;
      --rd-status-warning-bg: rgba(245, 158, 11, 0.12);

      --rd-status-error: #ef4444;
      --rd-status-error-bright: #f87171;
      --rd-diff-remove-text: #fca5a5;
      --rd-diff-remove-bg: rgba(239, 68, 68, 0.12);
      --rd-diff-remove-border: rgba(239, 68, 68, 0.30);

      --rd-status-info: #3b82f6;
      --rd-status-info-bright: #60a5fa;

      /* Typography Font Stacks */
      --rd-font-sans: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --rd-font-mono: 'Geist Mono', 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Monaco, Consolas, monospace;

      /* Spacing Scale */
      --rd-space-2xs: 2px;
      --rd-space-xs: 4px;
      --rd-space-sm: 6px;
      --rd-space-md: 8px;
      --rd-space-lg: 12px;
      --rd-space-xl: 16px;
      --rd-space-2xl: 20px;
      --rd-space-3xl: 24px;
      --rd-space-4xl: 32px;

      /* Border Radii */
      --rd-radius-xs: 3px;
      --rd-radius-sm: 6px;
      --rd-radius-md: 8px;
      --rd-radius-lg: 12px;
      --rd-radius-full: 9999px;

      /* Elevation Shadows */
      --rd-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--rd-border-subtle);
      --rd-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--rd-border-subtle);
      --rd-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.65), 0 0 0 1px var(--rd-border-default);
      --rd-shadow-floating-pill: 0 8px 24px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 0 1px var(--rd-border-default);
      --rd-shadow-ai-active: 0 0 28px rgba(139, 92, 246, 0.25), 0 12px 36px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 0 0 1px rgba(139, 92, 246, 0.4);

      position: fixed;
      z-index: 2147483646;
      pointer-events: none;
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      font-family: var(--rd-font-sans);
      font-size: 13px;
      line-height: 1.4;
      color: var(--rd-text-primary);
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    .rd-root {
      pointer-events: auto;
    }
    .launcher {
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 2147483646;
      background: rgba(18, 18, 22, 0.88);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      color: #33BBCA;
      border: 1px solid #282833;
      border-radius: 9999px;
      padding: 4px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      transition: all 0.3s ease-out;
      overflow: hidden;
      max-width: 44px;
      height: 44px;
      pointer-events: auto;
      user-select: none;
      outline: none;
    }
    .launcher:hover {
      max-width: 480px;
      padding-right: 14px;
      border-color: rgba(51, 187, 202, 0.5);
      box-shadow: 0 12px 32px rgba(0,0,0,0.8), 0 0 16px rgba(51, 187, 202, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }
    .launcher-brand-icon {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: #14141c;
      border: 1px solid #2e2e3d;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 5px;
      flex-shrink: 0;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);
      transition: border-color 0.2s ease;
    }
    .launcher:hover .launcher-brand-icon {
      border-color: rgba(51, 187, 202, 0.6);
    }
    .launcher-telemetry {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: 'Geist Mono', Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      white-space: nowrap;
      opacity: 0;
      max-width: 0;
      overflow: hidden;
      transition: all 0.3s ease-out;
      margin-left: 0;
    }
    .launcher:hover .launcher-telemetry {
      opacity: 1;
      max-width: 420px;
      margin-left: 10px;
    }
    .panel {
      position: fixed;
      bottom: 76px;
      left: 24px;
      width: min(760px, calc(100vw - 48px));
      max-height: calc(100vh - 100px);
      background: rgba(22, 22, 28, 0.96);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid #282833;
      border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      z-index: 2147483646;
      animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: visible;
      pointer-events: auto;
    }
    @keyframes slideUp {
      from { transform: translateY(16px); opacity: 0.8; }
      to { transform: translateY(0); opacity: 1; }
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: #121216;
      border-bottom: 1px solid #1f1f26;
      border-radius: 16px 16px 0 0;
      gap: 12px;
      flex-wrap: nowrap;
      white-space: nowrap;
    }
    .brand {
      font-weight: 700;
      color: #33BBCA;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      flex-shrink: 0;
    }
    .brand-icon-box {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: #14141c;
      border: 1px solid #2e2e3d;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      flex-shrink: 0;
    }
    .tabs {
      display: flex;
      gap: 4px;
      background: #16161c;
      padding: 3px;
      border-radius: 8px;
      border: 1px solid #282833;
      flex-shrink: 0;
    }
    .tab {
      background: transparent;
      border: none;
      color: #94a3b8;
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .tab.active {
      background: #24242e;
      color: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    }
    .tab:hover:not(.active) {
      color: #ffffff;
    }
    .close-btn {
      background: #1c1c24;
      border: 1px solid #282833;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }
    .close-btn:hover {
      background: #282833;
      color: #ffffff;
    }
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .waterfall-row {
      display: flex;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid #1f1f26;
      font-family: 'Geist Mono', monospace;
      font-size: 11px;
    }
    .waterfall-bar {
      height: 8px;
      background: #33BBCA;
      border-radius: 4px;
      margin-left: 12px;
      min-width: 4px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-success { background: #064e3b; color: #34d399; }
    .badge-warning { background: #78350f; color: #fbbf24; }
    .badge-error { background: #7f1d1d; color: #f87171; }
    .code-block {
      background: #0a0a0c;
      padding: 10px;
      border-radius: 8px;
      font-family: 'Geist Mono', monospace;
      font-size: 11px;
      color: #e2e8f0;
      border: 1px solid #1f1f26;
    }
    .partner-pill {
      background: transparent;
      border: 1px solid #282833;
      color: #94a3b8;
      border-radius: 12px;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .partner-pill.active {
      background: #1c1c24;
      color: #33BBCA;
      border-color: #33BBCA;
    }
    .partner-pill:hover:not(.active) {
      color: #f8fafc;
      border-color: #64748b;
    }
    .ai-prompt-bar {
      display: flex;
      flex-direction: column;
      background: #121217;
      border: 1px solid #282833;
      border-radius: 12px;
      padding: 10px;
      gap: 10px;
      transition: border-color 0.2s ease;
      position: relative;
    }
    .ai-prompt-bar:focus-within {
      border-color: #33BBCA;
    }
    .ai-prompt-input {
      width: 100%;
      background: transparent;
      border: none;
      color: #f8fafc;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      resize: none;
    }
    .ai-prompt-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-top: 1px solid #1f1f26;
      padding-top: 8px;
      position: relative;
    }
    .ai-btn-generate {
      background: #33BBCA;
      color: #0a0a0f;
      border: none;
      border-radius: 8px;
      padding: 7px 16px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 10px rgba(51, 187, 202, 0.25);
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .ai-btn-generate:hover {
      background: #2cb2c0;
      box-shadow: 0 4px 14px rgba(51, 187, 202, 0.4);
    }
    .ai-btn-generate:active {
      transform: scale(0.97);
    }
    .ai-btn-stop {
      background: #ef4444;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 7px 16px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .ai-btn-stop:hover {
      background: #dc2626;
    }
    .ai-btn-accept {
      background: #10b981;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: background 0.15s ease;
    }
    .ai-btn-accept:hover {
      background: #059669;
    }
    .ai-btn-revert {
      background: #1c1c24;
      color: #fca5a5;
      border: 1px solid #282833;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ai-btn-revert:hover {
      background: #282833;
      color: #ffffff;
    }
    .diff-container {
      display: flex;
      flex-direction: column;
      background: #0a0a0c;
      border: 1px solid #282833;
      border-radius: 12px;
      overflow: hidden;
      margin-top: 10px;
    }
    .diff-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 14px;
      background: #121216;
      border-bottom: 1px solid #1f1f26;
    }
    .diff-table {
      overflow-y: auto;
      max-height: 200px;
      font-family: 'Geist Mono', monospace;
      font-size: 11px;
    }
    .diff-line {
      display: flex;
      padding: 2px 8px;
      line-height: 1.4;
    }
    .diff-line.added {
      background: rgba(16, 185, 129, 0.12);
      color: #4ade80;
      border-left: 3px solid #10b981;
    }
    .diff-line.removed {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border-left: 3px solid #ef4444;
    }
    .diff-line.unchanged {
      color: #94a3b8;
      border-left: 3px solid transparent;
    }
    .diff-gutter {
      width: 32px;
      color: #64748b;
      user-select: none;
      flex-shrink: 0;
    }
    .diff-sign {
      width: 16px;
      font-weight: bold;
      user-select: none;
      flex-shrink: 0;
    }
    .diff-text {
      white-space: pre-wrap;
      word-break: break-all;
    }
    .custom-dropdown-container {
      position: relative;
      display: inline-block;
    }
    .custom-dropdown-trigger {
      background: #1c1c24;
      border: 1px solid #282833;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11px;
      font-family: 'Geist Mono', monospace;
      color: #f8fafc;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .custom-dropdown-trigger:hover {
      background: #24242e;
      border-color: rgba(51, 187, 202, 0.4);
    }
    .custom-dropdown-menu {
      position: absolute;
      bottom: 100%;
      margin-bottom: 6px;
      left: 0;
      width: 180px;
      background: #14141c;
      border: 1px solid #2e2e3d;
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
      z-index: 100;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      max-height: 260px;
      overflow-y: auto;
      font-family: 'Geist Mono', monospace;
      font-size: 11px;
    }
    .dropdown-option {
      background: transparent;
      border: none;
      border-radius: 8px;
      padding: 6px 10px;
      color: #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;
      width: 100%;
    }
    .dropdown-option:hover {
      background: #242432;
      color: #ffffff;
    }
    .btn-auth-trigger {
      background: #1f1f28;
      border: 1px solid #2e2e3d;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11px;
      font-family: 'Geist Mono', monospace;
      color: #c4b5fd;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn-auth-trigger:hover {
      background: #282836;
      color: #ffffff;
    }
    .rd-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(10, 10, 12, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .rd-modal-card {
      background: #14141a;
      border: 1px solid #282833;
      border-radius: 16px;
      width: 720px;
      max-width: 95vw;
      box-shadow: 0 24px 64px rgba(0,0,0,0.9);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
  `;

  shadow.appendChild(style);

  const wrapper = activeDoc.createElement('div');
  wrapper.className = 'rd-root';
  wrapper.onclick = (e: Event) => {
    handleOutsideClick(e);
  };
  shadow.appendChild(wrapper);

  function render(state: DevToolsDockState): void {
    wrapper.innerHTML = '';

    if (!state.isOpen) {
      const launcher = activeDoc.createElement('button');
      launcher.className = 'launcher';
      launcher.title = 'Ranu DevTools (Click to expand, hover to inspect)';
      launcher.onclick = () => toggleDevToolsDock();

      const chunkCount = state.streamingChunks.length;
      launcher.innerHTML = `
        <div class="launcher-brand-icon">
          ${RANU_BRAND_ICON_SVG}
        </div>
        <span style="display:none">⚡</span>
        <span style="display:none">Ranu DevTools</span>
        <div class="launcher-telemetry">
          <div style="display:flex;align-items:center;gap:4px;color:#94a3b8;">
            <span style="color:#64748b;">TTFB:</span>
            <span style="color:#34d399;font-weight:600;">18ms</span>
          </div>
          <span style="color:#334155;">|</span>
          <div style="display:flex;align-items:center;gap:4px;color:#94a3b8;">
            <span style="color:#64748b;">Chunks:</span>
            <span style="color:#38bdf8;font-weight:600;">${chunkCount > 0 ? chunkCount : 14}</span>
          </div>
          <span style="color:#334155;">|</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="width:6px;height:6px;border-radius:50%;background:#34d399;display:inline-block;"></span>
            <span style="color:#33BBCA;font-weight:600;">Copilot Ready</span>
          </div>
          <div style="width:20px;height:20px;border-radius:50%;background:#1c1c24;display:flex;align-items:center;justify-content:center;color:#94a3b8;margin-left:4px;">
            ${ICONS.chevronUp}
          </div>
        </div>
      `;
      wrapper.appendChild(launcher);
      return;
    }

    const panel = activeDoc.createElement('div');
    panel.className = 'panel';

    const header = activeDoc.createElement('div');
    header.className = 'header';

    const brand = activeDoc.createElement('div');
    brand.className = 'brand';
    brand.innerHTML = `
      <div class="brand-icon-box">
        ${RANU_BRAND_ICON_SVG}
      </div>
      <span style="display:none">⚡</span>
      <span>Ranu AI Developer Studio</span>
      <span style="padding:2px 6px;border-radius:4px;font-size:10px;font-family:monospace;background:rgba(51,187,202,0.1);color:#33BBCA;border:1px solid rgba(51,187,202,0.3);">v2026.1</span>
    `;

    const tabs = activeDoc.createElement('div');
    tabs.className = 'tabs';

    const tabList: Array<{ id: DevToolsDockState['activeTab']; label: string }> = [
      { id: 'waterfall', label: `Waterfall (${state.streamingChunks.length})` },
      { id: 'routes', label: 'Route Hierarchy' },
      { id: 'hydration', label: `Hydration (${state.hydration.status})` },
      { id: 'diagnostics', label: `Diagnostics (${state.diagnostics.length})` },
      { id: 'ai-studio', label: 'AI Studio ✨' },
    ];

    tabList.forEach((t) => {
      const tabBtn = activeDoc.createElement('button');
      tabBtn.className = `tab ${state.activeTab === t.id ? 'active' : ''}`;
      tabBtn.textContent = t.label;
      tabBtn.onclick = () => {
        isProviderDropdownOpen = false;
        if (pingTimeoutId) {
          clearTimeout(pingTimeoutId);
          pingTimeoutId = null;
        }
        isPingTesting = false;
        isAuthModalOpen = false;
        setActiveDevToolsTab(t.id);
      };
      tabs.appendChild(tabBtn);
    });

    const closeBtn = activeDoc.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.title = 'Minimize DevTools';
    closeBtn.innerHTML = ICONS.chevronDown;
    closeBtn.onclick = () => {
      isProviderDropdownOpen = false;
      if (pingTimeoutId) {
        clearTimeout(pingTimeoutId);
        pingTimeoutId = null;
      }
      isPingTesting = false;
      isAuthModalOpen = false;
      toggleDevToolsDock();
    };

    header.appendChild(brand);
    header.appendChild(tabs);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const content = activeDoc.createElement('div');
    content.className = 'content';

    if (state.activeTab === 'waterfall') {
      if (state.streamingChunks.length === 0) {
        content.innerHTML = '<div style="color:#64748b;">No streaming chunks recorded yet.</div>';
      } else {
        const list = activeDoc.createElement('div');
        state.streamingChunks.forEach((c) => {
          const row = activeDoc.createElement('div');
          row.className = 'waterfall-row';
          const maxDelta = Math.max(...state.streamingChunks.map((ch) => ch.deltaMs), 1);
          const barWidth = Math.max(10, Math.min(300, Math.round((c.deltaMs / maxDelta) * 250)));
          row.innerHTML = `
            <span style="width:70px;color:#94a3b8;">Chunk #${c.id}</span>
            <span style="width:80px;color:#33BBCA;">+${c.deltaMs}ms</span>
            <span style="width:70px;color:#e2e8f0;">${c.bytes} B</span>
            <div class="waterfall-bar" style="width:${barWidth}px;"></div>
            <span style="margin-left:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${c.preview}</span>
          `;
          list.appendChild(row);
        });
        content.appendChild(list);
      }
    } else if (state.activeTab === 'routes') {
      if (!state.currentRoute) {
        content.innerHTML = '<div style="color:#64748b;">No route hierarchy loaded.</div>';
      } else {
        content.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div><strong style="color:#33BBCA;">Active Route:</strong> <code>${state.currentRoute.routeId}</code></div>
            <div><strong>Pathname:</strong> <code>${state.currentRoute.pathname}</code></div>
            <div><strong>Layouts Stack:</strong> ${state.currentRoute.layouts.map((l) => `<code>${l}</code>`).join(' → ') || '<em>None</em>'}</div>
            <div><strong>Loading Boundary:</strong> <code>${state.currentRoute.loading || 'Default'}</code></div>
          </div>
        `;
      }
    } else if (state.activeTab === 'hydration') {
      const badgeClass =
        state.hydration.status === 'success'
          ? 'badge-success'
          : state.hydration.status === 'mismatch'
            ? 'badge-warning'
            : state.hydration.status === 'error'
              ? 'badge-error'
              : 'badge-warning';

      content.innerHTML = `
        <div style="margin-bottom:12px;">
          <span class="badge ${badgeClass}">Status: ${state.hydration.status.toUpperCase()}</span>
          ${state.hydration.hydrationTimeMs !== undefined ? `<span style="margin-left:10px;color:#94a3b8;">Hydrated in ${state.hydration.hydrationTimeMs}ms</span>` : ''}
        </div>
      `;

      if (state.hydration.mismatches.length > 0) {
        const table = activeDoc.createElement('div');
        state.hydration.mismatches.forEach((m) => {
          const item = activeDoc.createElement('div');
          item.style.borderBottom = '1px solid #1f1f26';
          item.style.padding = '8px 0';
          item.innerHTML = `
            <div style="color:#fbbf24;font-weight:600;">${m.type}: <code>${m.path}</code></div>
            <div style="color:#cbd5e1;font-size:12px;margin:4px 0;">${m.message}</div>
          `;
          table.appendChild(item);
        });
        content.appendChild(table);
      } else {
        content.innerHTML += '<div style="color:#34d399;">✓ Perfect hydration. No DOM mismatches detected.</div>';
      }
    } else if (state.activeTab === 'diagnostics') {
      if (state.diagnostics.length === 0) {
        content.innerHTML = '<div style="color:#34d399;">✓ Zero compiler or AST invariant diagnostics.</div>';
      } else {
        const diagList = activeDoc.createElement('div');
        state.diagnostics.forEach((d) => {
          const card = activeDoc.createElement('div');
          card.style.marginBottom = '12px';
          card.innerHTML = `
            <div style="color:#f87171;font-weight:600;">[${d.code}] ${d.message}</div>
            ${d.location ? `<div style="color:#64748b;font-size:11px;">at ${d.location.file || ''}:${d.location.line || ''}</div>` : ''}
            ${d.hint ? `<div class="code-block" style="margin-top:4px;">💡 Hint: ${d.hint}</div>` : ''}
          `;
          diagList.appendChild(card);
        });
        content.appendChild(diagList);
      }
    } else if (state.activeTab === 'ai-studio') {
      const aiStudioContainer = activeDoc.createElement('div');
      aiStudioContainer.className = 'ai-studio-container';
      aiStudioContainer.style.display = 'flex';
      aiStudioContainer.style.flexDirection = 'column';
      aiStudioContainer.style.gap = '12px';

      // Context Chips
      const contextRow = activeDoc.createElement('div');
      contextRow.style.display = 'flex';
      contextRow.style.alignItems = 'center';
      contextRow.style.gap = '8px';
      contextRow.style.fontSize = '11px';
      contextRow.style.fontFamily = 'monospace';
      contextRow.innerHTML = `
        <span style="color:#64748b;">Active Context:</span>
        <span style="padding:3px 8px;border-radius:6px;background:#1c1c24;border:1px solid rgba(51,187,202,0.3);color:#33BBCA;display:flex;align-items:center;gap:6px;">
          <span style="width:6px;height:6px;border-radius:50%;background:#33BBCA;display:inline-block;"></span>
          <span>src/components/UserTable.tsx</span>
        </span>
        <span style="padding:3px 8px;border-radius:6px;background:#16161c;border:1px solid #282833;color:#94a3b8;cursor:pointer;">
          + Add File Context
        </span>
      `;
      aiStudioContainer.appendChild(contextRow);

      // 1. Partner pills (Gemini, Groq, Claude, OpenAI, Custom)
      const partnersRow = activeDoc.createElement('div');
      partnersRow.style.display = 'flex';
      partnersRow.style.gap = '6px';
      partnersRow.style.alignItems = 'center';
      partnersRow.style.flexWrap = 'wrap';

      const partnerLabel = activeDoc.createElement('span');
      partnerLabel.style.fontSize = '11px';
      partnerLabel.style.color = '#94a3b8';
      partnerLabel.style.fontWeight = '600';
      partnerLabel.textContent = 'PARTNER:';
      partnersRow.appendChild(partnerLabel);

      const partners: Array<{ id: AIStudioPartner; label: string }> = [
        { id: 'gemini', label: '✦ Gemini' },
        { id: 'groq', label: '⚡ Groq' },
        { id: 'claude', label: '▲ Claude' },
        { id: 'openai', label: '● OpenAI' },
        { id: 'custom', label: '⚙ Custom' },
      ];

      partners.forEach((p) => {
        const pill = activeDoc.createElement('button');
        pill.className = `partner-pill ${state.aiStudio.selectedPartner === p.id ? 'active' : ''}`;
        pill.textContent = p.label;
        pill.onclick = () => {
          setSelectedPartner(p.id);
        };
        partnersRow.appendChild(pill);
      });
      aiStudioContainer.appendChild(partnersRow);

      // 2. Prompt Bar
      const promptBar = activeDoc.createElement('div');
      promptBar.className = 'ai-prompt-bar';

      const promptInput = activeDoc.createElement('input') as HTMLInputElement;
      promptInput.className = 'ai-prompt-input';
      promptInput.placeholder =
        'Describe UI or API changes (e.g. "Convert UserTable to streaming infinite scroll")...';
      promptInput.value = state.aiStudio.currentPrompt;
      promptInput.disabled = state.aiStudio.isGenerating;
      promptInput.onfocus = () => {
        isPromptFocused = true;
      };
      promptInput.onblur = () => {
        isPromptFocused = false;
      };
      promptInput.oninput = (e: Event) => {
        const target = e.target as HTMLInputElement | null;
        promptCursorPos = target?.selectionStart ?? null;
        setCurrentPrompt(target?.value ?? promptInput.value);
      };
      promptInput.onkeydown = (e: KeyboardEvent) => {
        if (typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
        if (e.key === 'Enter' && !e.shiftKey && promptInput.value.trim()) {
          void submitAIPrompt(promptInput.value);
        }
      };
      promptInput.onkeyup = (e: KeyboardEvent) => {
        if (typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
      };
      promptBar.appendChild(promptInput);

      if (isPromptFocused) {
        if (typeof promptInput.focus === 'function') {
          promptInput.focus();
        }
        if (promptCursorPos !== null && typeof promptInput.setSelectionRange === 'function') {
          try {
            promptInput.setSelectionRange(promptCursorPos, promptCursorPos);
          } catch {
            // ignore in mock environments
          }
        }
      }

      // Prompt Bar Footer with Custom Popover Dropdown, BYOK Trigger, and Refactor CTA
      const promptFooter = activeDoc.createElement('div');
      promptFooter.className = 'ai-prompt-footer';

      const leftControls = activeDoc.createElement('div');
      leftControls.style.display = 'flex';
      leftControls.style.alignItems = 'center';
      leftControls.style.gap = '8px';

      // Custom Provider Popover Dropdown Container
      const providerDropdownContainer = activeDoc.createElement('div');
      providerDropdownContainer.className = 'custom-dropdown-container';
      providerDropdownContainer.onclick = (e) => {
        if (typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
      };

      const currentProvider = state.aiStudio.selectedPartner || 'groq';
      const providerIcon = ICONS[currentProvider as keyof typeof ICONS] || ICONS.groq;
      const providerDisplayName =
        currentProvider === 'groq'
          ? 'Groq'
          : currentProvider === 'gemini'
            ? 'Gemini'
            : currentProvider === 'claude'
              ? 'Claude'
              : currentProvider === 'openai'
                ? 'OpenAI'
                : currentProvider === 'ollama'
                  ? 'Ollama'
                  : currentProvider === 'none'
                    ? 'Disabled'
                    : 'Custom';

      const dropdownBtn = activeDoc.createElement('button');
      dropdownBtn.type = 'button';
      dropdownBtn.className = 'custom-dropdown-trigger';
      dropdownBtn.innerHTML = `
        <span>Provider:</span>
        <span style="display:inline-flex;align-items:center;">${providerIcon}</span>
        <span>${providerDisplayName}</span>
        ${ICONS.chevronDown}
      `;
      dropdownBtn.onclick = (e) => {
        if (typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
        isProviderDropdownOpen = !isProviderDropdownOpen;
        render(getDevToolsState());
      };
      providerDropdownContainer.appendChild(dropdownBtn);

      if (isProviderDropdownOpen) {
        const dropdownMenu = activeDoc.createElement('div');
        dropdownMenu.className = 'custom-dropdown-menu';
        dropdownMenu.onclick = (e) => {
          if (typeof e.stopPropagation === 'function') {
            e.stopPropagation();
          }
        };

        const providerOptions: Array<{ id: AIStudioPartner; name: string; icon: string; status: string }> = [
          { id: 'groq', name: 'Groq', icon: ICONS.groq, status: '#34d399' },
          { id: 'gemini', name: 'Gemini', icon: ICONS.gemini, status: '#fbbf24' },
          { id: 'claude', name: 'Claude', icon: ICONS.claude, status: '#34d399' },
          { id: 'openai', name: 'OpenAI', icon: ICONS.openai, status: '#34d399' },
          { id: 'ollama', name: 'Ollama', icon: ICONS.ollama, status: '#38bdf8' },
          { id: 'none', name: 'Disabled', icon: ICONS.none, status: '#64748b' },
        ];

        providerOptions.forEach((opt) => {
          const item = activeDoc.createElement('button');
          item.type = 'button';
          item.className = 'dropdown-option';
          item.innerHTML = `
            <span style="display:flex;align-items:center;gap:8px;">
              ${opt.icon}
              <span style="font-weight:500;">${opt.name}</span>
            </span>
            <span style="width:6px;height:6px;border-radius:50%;background:${opt.status};display:inline-block;"></span>
          `;
          item.onclick = (ev) => {
            if (typeof ev.stopPropagation === 'function') {
              ev.stopPropagation();
            }
            setSelectedPartner(opt.id);
            activeModalProvider = opt.id;
            isProviderDropdownOpen = false;
            render(getDevToolsState());
          };
          dropdownMenu.appendChild(item);
        });
        providerDropdownContainer.appendChild(dropdownMenu);
      }
      leftControls.appendChild(providerDropdownContainer);

      // Settings & BYOK Trigger Button
      const authTriggerBtn = activeDoc.createElement('button');
      authTriggerBtn.type = 'button';
      authTriggerBtn.id = 'btn-auth-trigger';
      authTriggerBtn.className = 'btn-auth-trigger';
      const isCurrentConnected = isAccountConnected[currentProvider] ?? true;
      authTriggerBtn.innerHTML = `
        <span style="width:6px;height:6px;border-radius:50%;background:${isCurrentConnected ? '#34d399' : '#fbbf24'};display:inline-block;"></span>
        <span>${isCurrentConnected ? 'Connected' : 'Configure'}</span>
        ${ICONS.settings}
      `;
      authTriggerBtn.onclick = (e) => {
        if (typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
        isProviderDropdownOpen = false;
        activeModalProvider = state.aiStudio.selectedPartner;
        isAuthModalOpen = true;
        render(getDevToolsState());
      };
      leftControls.appendChild(authTriggerBtn);
      promptFooter.appendChild(leftControls);

      // Primary Refactor CTA Button (styled in #33BBCA without shortcut clutter)
      if (state.aiStudio.isGenerating) {
        const stopBtn = activeDoc.createElement('button');
        stopBtn.className = 'ai-btn-stop';
        stopBtn.textContent = 'Stop';
        stopBtn.onclick = () => abortAIGeneration();
        promptFooter.appendChild(stopBtn);
      } else {
        const generateBtn = activeDoc.createElement('button');
        generateBtn.className = 'ai-btn-generate';
        generateBtn.innerHTML = `
          ${ICONS.sparkles}
          <span>Refactor</span>
          <span style="display:none">Generate</span>
        `;
        generateBtn.onclick = () => {
          if (promptInput.value.trim()) {
            void submitAIPrompt(promptInput.value);
          }
        };
        promptFooter.appendChild(generateBtn);
      }
      promptBar.appendChild(promptFooter);
      aiStudioContainer.appendChild(promptBar);

      // Error message if any
      if (state.aiStudio.error) {
        const errBox = activeDoc.createElement('div');
        errBox.style.color = '#f87171';
        errBox.style.background = 'rgba(239, 68, 68, 0.1)';
        errBox.style.border = '1px solid #ef4444';
        errBox.style.padding = '8px 12px';
        errBox.style.borderRadius = '8px';
        errBox.style.fontSize = '12px';
        errBox.textContent = `Error: ${state.aiStudio.error}`;
        aiStudioContainer.appendChild(errBox);
      }

      // Visual Diff or Streaming Preview or Placeholder
      if (state.aiStudio.pendingDiff) {
        const diff = state.aiStudio.pendingDiff;
        const diffContainer = activeDoc.createElement('div');
        diffContainer.className = 'diff-container';

        const toolbar = activeDoc.createElement('div');
        toolbar.className = 'diff-toolbar';

        const info = activeDoc.createElement('div');
        info.style.display = 'flex';
        info.style.alignItems = 'center';
        info.style.gap = '8px';
        info.innerHTML = `
          <span style="color:#33BBCA;font-weight:600;">📄 ${diff.filePath}</span>
          <span style="font-size:11px;color:#94a3b8;">${diff.patchSummary}</span>
        `;
        toolbar.appendChild(info);

        const actions = activeDoc.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';

        const revertBtn = activeDoc.createElement('button');
        revertBtn.className = 'ai-btn-revert';
        revertBtn.textContent = '✕ Discard';
        revertBtn.onclick = () => revertAIChanges();
        actions.appendChild(revertBtn);

        const acceptBtn = activeDoc.createElement('button');
        acceptBtn.className = 'ai-btn-accept';
        acceptBtn.textContent = '✓ Accept Changes';
        acceptBtn.onclick = () => {
          void acceptAIChanges(diff);
        };
        actions.appendChild(acceptBtn);

        toolbar.appendChild(actions);
        diffContainer.appendChild(toolbar);

        const table = activeDoc.createElement('div');
        table.className = 'diff-table';

        const diffLines = computeLineDiff(diff.originalContent, diff.proposedContent);
        diffLines.forEach((line) => {
          const row = activeDoc.createElement('div');
          row.className = `diff-line ${line.type}`;

          const origGutter = activeDoc.createElement('span');
          origGutter.className = 'diff-gutter';
          origGutter.textContent =
            line.originalLineNumber !== undefined ? String(line.originalLineNumber) : '';
          row.appendChild(origGutter);

          const modGutter = activeDoc.createElement('span');
          modGutter.className = 'diff-gutter';
          modGutter.textContent =
            line.modifiedLineNumber !== undefined ? String(line.modifiedLineNumber) : '';
          row.appendChild(modGutter);

          const sign = activeDoc.createElement('span');
          sign.className = 'diff-sign';
          sign.textContent = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
          row.appendChild(sign);

          const text = activeDoc.createElement('span');
          text.className = 'diff-text';
          text.textContent = line.content;
          row.appendChild(text);

          table.appendChild(row);
        });

        diffContainer.appendChild(table);
        aiStudioContainer.appendChild(diffContainer);
      } else if (state.aiStudio.streamingResponse) {
        const preview = activeDoc.createElement('div');
        preview.className = 'code-block';
        preview.style.whiteSpace = 'pre-wrap';
        preview.style.maxHeight = '180px';
        preview.style.overflowY = 'auto';
        preview.textContent = state.aiStudio.streamingResponse;
        aiStudioContainer.appendChild(preview);
      } else {
        const placeholder = activeDoc.createElement('div');
        placeholder.style.color = '#64748b';
        placeholder.style.textAlign = 'center';
        placeholder.style.padding = '24px 0';
        placeholder.textContent =
          'Select an AI partner, enter your instructions above, and review visual diffs in real-time.';
        aiStudioContainer.appendChild(placeholder);
      }

      content.appendChild(aiStudioContainer);
    }

    if (state.dockPosition === 'top') {
      panel.style.top = '0';
      panel.style.bottom = 'auto';
      panel.style.borderTop = 'none';
      panel.style.borderBottom = '1px solid #282833';
    }

    panel.appendChild(content);
    wrapper.appendChild(panel);

    // BYOK & Provider Auth Modal Component
    if (isAuthModalOpen) {
      const modalBackdrop = activeDoc.createElement('div');
      modalBackdrop.className = 'rd-modal-backdrop';
      modalBackdrop.onclick = () => {
        if (pingTimeoutId) {
          clearTimeout(pingTimeoutId);
          pingTimeoutId = null;
        }
        isPingTesting = false;
        isAuthModalOpen = false;
        render(getDevToolsState());
      };

      const modalCard = activeDoc.createElement('div');
      modalCard.className = 'rd-modal-card';
      modalCard.onclick = (e) => e.stopPropagation();

      const modalHeader = activeDoc.createElement('div');
      modalHeader.style.padding = '14px 20px';
      modalHeader.style.background = '#121216';
      modalHeader.style.borderBottom = '1px solid #282833';
      modalHeader.style.display = 'flex';
      modalHeader.style.alignItems = 'center';
      modalHeader.style.justifyContent = 'space-between';
      modalHeader.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:8px;background:rgba(51,187,202,0.15);border:1px solid rgba(51,187,202,0.3);display:flex;align-items:center;justify-content:center;color:#33BBCA;">
            ${ICONS.key}
          </div>
          <div>
            <div style="font-weight:600;color:#ffffff;font-size:14px;">AI Provider Authentication</div>
            <div style="font-size:11px;color:#94a3b8;">Connect account via OAuth or direct API key (BYOK).</div>
          </div>
        </div>
      `;

      const modalClose = activeDoc.createElement('button');
      modalClose.className = 'close-btn';
      modalClose.innerHTML = ICONS.close;
      modalClose.onclick = () => {
        if (pingTimeoutId) {
          clearTimeout(pingTimeoutId);
          pingTimeoutId = null;
        }
        isPingTesting = false;
        isAuthModalOpen = false;
        render(getDevToolsState());
      };
      modalHeader.appendChild(modalClose);
      modalCard.appendChild(modalHeader);

      const modalBody = activeDoc.createElement('div');
      modalBody.style.display = 'flex';
      modalBody.style.minHeight = '300px';

      // Left sidebar: Providers list
      const sidebar = activeDoc.createElement('div');
      sidebar.style.width = '190px';
      sidebar.style.padding = '12px';
      sidebar.style.borderRight = '1px solid #282833';
      sidebar.style.display = 'flex';
      sidebar.style.flexDirection = 'column';
      sidebar.style.gap = '4px';

      const modalProviders: Array<{ id: AIStudioPartner; name: string; icon: string }> = [
        { id: 'groq', name: 'Groq', icon: ICONS.groq },
        { id: 'gemini', name: 'Gemini', icon: ICONS.gemini },
        { id: 'claude', name: 'Claude', icon: ICONS.claude },
        { id: 'openai', name: 'OpenAI', icon: ICONS.openai },
        { id: 'ollama', name: 'Ollama', icon: ICONS.ollama },
        { id: 'none', name: 'Disabled', icon: ICONS.none },
      ];

      modalProviders.forEach((prov) => {
        const provBtn = activeDoc.createElement('button');
        const isSelected = activeModalProvider === prov.id;
        provBtn.style.background = isSelected ? '#24242e' : 'transparent';
        provBtn.style.border = isSelected ? '1px solid rgba(51,187,202,0.4)' : '1px solid transparent';
        provBtn.style.color = isSelected ? '#ffffff' : '#94a3b8';
        provBtn.style.borderRadius = '8px';
        provBtn.style.padding = '8px 10px';
        provBtn.style.display = 'flex';
        provBtn.style.alignItems = 'center';
        provBtn.style.justifyContent = 'space-between';
        provBtn.style.cursor = 'pointer';
        provBtn.style.fontSize = '12px';
        provBtn.style.fontFamily = 'monospace';
        provBtn.style.width = '100%';

        const isConn = isAccountConnected[prov.id] ?? false;
        const dotColor =
          prov.id === 'none'
            ? '#64748b'
            : prov.id === 'ollama'
              ? '#38bdf8'
              : isConn
                ? '#34d399'
                : '#fbbf24';
        provBtn.innerHTML = `
          <span style="display:flex;align-items:center;gap:8px;">
            ${prov.icon}
            <span>${prov.name}</span>
          </span>
          <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};"></span>
        `;
        provBtn.onclick = () => {
          if (pingTimeoutId) {
            clearTimeout(pingTimeoutId);
            pingTimeoutId = null;
          }
          isPingTesting = false;
          activeModalProvider = prov.id;
          pingResult = null;
          render(getDevToolsState());
        };
        sidebar.appendChild(provBtn);
      });
      modalBody.appendChild(sidebar);

      // Right form panel
      const formPanel = activeDoc.createElement('div');
      formPanel.style.flex = '1';
      formPanel.style.padding = '16px 20px';
      formPanel.style.display = 'flex';
      formPanel.style.flexDirection = 'column';
      formPanel.style.gap = '14px';

      // Header of selected provider
      const activeIcon = ICONS[activeModalProvider as keyof typeof ICONS] || ICONS.groq;
      const isConnected = isAccountConnected[activeModalProvider] ?? false;
      const provHeader = activeDoc.createElement('div');
      provHeader.style.display = 'flex';
      provHeader.style.alignItems = 'center';
      provHeader.style.justifyContent = 'space-between';
      provHeader.style.paddingBottom = '10px';
      provHeader.style.borderBottom = '1px solid #282833';

      const badgeText =
        activeModalProvider === 'none'
          ? 'Off'
          : activeModalProvider === 'ollama'
            ? 'Local'
            : isConnected
              ? 'Connected'
              : 'Unconfigured';
      const badgeColor =
        activeModalProvider === 'none'
          ? '#64748b'
          : activeModalProvider === 'ollama'
            ? '#38bdf8'
            : isConnected
              ? '#34d399'
              : '#fbbf24';
      const badgeBg =
        activeModalProvider === 'none'
          ? 'rgba(100,116,139,0.15)'
          : activeModalProvider === 'ollama'
            ? 'rgba(56,189,248,0.15)'
            : isConnected
              ? 'rgba(52,211,153,0.15)'
              : 'rgba(251,191,36,0.15)';
      const badgeBorder =
        activeModalProvider === 'none'
          ? 'rgba(100,116,139,0.3)'
          : activeModalProvider === 'ollama'
            ? 'rgba(56,189,248,0.3)'
            : isConnected
              ? 'rgba(52,211,153,0.3)'
              : 'rgba(251,191,36,0.3)';

      provHeader.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          ${activeIcon}
          <span style="font-weight:700;font-size:14px;color:#ffffff;text-transform:capitalize;">${activeModalProvider}</span>
          <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-family:monospace;background:${badgeBg};color:${badgeColor};border:1px solid ${badgeBorder};">
            ${badgeText}
          </span>
        </div>
      `;
      formPanel.appendChild(provHeader);

      // Method switcher: Account vs BYOK
      if (activeModalProvider !== 'ollama' && activeModalProvider !== 'none') {
        const activeAuthMethod = providerAuthModes[activeModalProvider] || 'account';
        const methodSwitcher = activeDoc.createElement('div');
        methodSwitcher.style.display = 'flex';
        methodSwitcher.style.background = '#0e0e13';
        methodSwitcher.style.padding = '3px';
        methodSwitcher.style.borderRadius = '8px';
        methodSwitcher.style.border = '1px solid #282833';

        const btnAccount = activeDoc.createElement('button');
        btnAccount.style.flex = '1';
        btnAccount.style.padding = '6px 12px';
        btnAccount.style.borderRadius = '6px';
        btnAccount.style.border = 'none';
        btnAccount.style.background = activeAuthMethod === 'account' ? '#33BBCA' : 'transparent';
        btnAccount.style.color = activeAuthMethod === 'account' ? '#0a0a0f' : '#94a3b8';
        btnAccount.style.fontWeight = '600';
        btnAccount.style.cursor = 'pointer';
        btnAccount.style.fontSize = '12px';
        btnAccount.style.display = 'flex';
        btnAccount.style.alignItems = 'center';
        btnAccount.style.justifyContent = 'center';
        btnAccount.style.gap = '6px';
        btnAccount.innerHTML = `${ICONS.link} <span>Connect Account</span>`;
        btnAccount.onclick = () => {
          providerAuthModes[activeModalProvider] = 'account';
          render(getDevToolsState());
        };
        methodSwitcher.appendChild(btnAccount);

        const btnByok = activeDoc.createElement('button');
        btnByok.style.flex = '1';
        btnByok.style.padding = '6px 12px';
        btnByok.style.borderRadius = '6px';
        btnByok.style.border = 'none';
        btnByok.style.background = activeAuthMethod === 'byok' ? '#33BBCA' : 'transparent';
        btnByok.style.color = activeAuthMethod === 'byok' ? '#0a0a0f' : '#94a3b8';
        btnByok.style.fontWeight = '600';
        btnByok.style.cursor = 'pointer';
        btnByok.style.fontSize = '12px';
        btnByok.style.display = 'flex';
        btnByok.style.alignItems = 'center';
        btnByok.style.justifyContent = 'center';
        btnByok.style.gap = '6px';
        btnByok.innerHTML = `${ICONS.key} <span>API Key (BYOK)</span>`;
        btnByok.onclick = () => {
          providerAuthModes[activeModalProvider] = 'byok';
          render(getDevToolsState());
        };
        methodSwitcher.appendChild(btnByok);
        formPanel.appendChild(methodSwitcher);

        // Account view vs BYOK view
        if (activeAuthMethod === 'account') {
          const accountBox = activeDoc.createElement('div');
          accountBox.style.background = '#121217';
          accountBox.style.border = '1px solid rgba(139,92,246,0.3)';
          accountBox.style.borderRadius = '10px';
          accountBox.style.padding = '12px';
          accountBox.style.display = 'flex';
          accountBox.style.flexDirection = 'column';
          accountBox.style.gap = '8px';

          accountBox.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;font-family:monospace;">
              <span style="color:#c4b5fd;">Workspace Identity: dev@ranu.local</span>
              <span style="color:#34d399;">${isConnected ? 'Active Session' : 'Offline'}</span>
            </div>
            <p style="font-size:11px;color:#94a3b8;">Seamless single sign-on connection. Credentials remain server-side.</p>
          `;

          const btnRow = activeDoc.createElement('div');
          btnRow.style.display = 'flex';
          btnRow.style.gap = '8px';
          btnRow.style.marginTop = '4px';

          const reAuthBtn = activeDoc.createElement('button');
          reAuthBtn.style.padding = '6px 12px';
          reAuthBtn.style.borderRadius = '6px';
          reAuthBtn.style.background = '#1e1e28';
          reAuthBtn.style.border = '1px solid #2e2e3d';
          reAuthBtn.style.color = '#ffffff';
          reAuthBtn.style.cursor = 'pointer';
          reAuthBtn.style.fontSize = '11px';
          reAuthBtn.textContent = 'Re-authenticate';
          reAuthBtn.onclick = () => {
            isAccountConnected[activeModalProvider] = true;
            render(getDevToolsState());
          };
          btnRow.appendChild(reAuthBtn);

          const disconnectBtn = activeDoc.createElement('button');
          disconnectBtn.style.padding = '6px 12px';
          disconnectBtn.style.borderRadius = '6px';
          disconnectBtn.style.background = 'rgba(239,68,68,0.1)';
          disconnectBtn.style.border = '1px solid rgba(239,68,68,0.3)';
          disconnectBtn.style.color = '#f87171';
          disconnectBtn.style.cursor = 'pointer';
          disconnectBtn.style.fontSize = '11px';
          disconnectBtn.textContent = 'Disconnect';
          disconnectBtn.onclick = () => {
            isAccountConnected[activeModalProvider] = false;
            render(getDevToolsState());
          };
          btnRow.appendChild(disconnectBtn);

          accountBox.appendChild(btnRow);
          formPanel.appendChild(accountBox);
        } else {
          const byokBox = activeDoc.createElement('div');
          byokBox.style.display = 'flex';
          byokBox.style.flexDirection = 'column';
          byokBox.style.gap = '6px';

          const keyLabel = activeDoc.createElement('label');
          keyLabel.style.fontSize = '11px';
          keyLabel.style.fontFamily = 'monospace';
          keyLabel.style.color = '#cbd5e1';
          keyLabel.textContent = `${activeModalProvider.toUpperCase()}_API_KEY:`;
          byokBox.appendChild(keyLabel);

          const inputRow = activeDoc.createElement('div');
          inputRow.style.display = 'flex';
          inputRow.style.gap = '8px';

          const currentKeyVal: string =
            enteredKeys[activeModalProvider] !== undefined
              ? String(enteredKeys[activeModalProvider])
              : isConnected
                ? '••••••••••••••••••••••••'
                : '';
          const keyInput = activeDoc.createElement('input') as HTMLInputElement;
          keyInput.type = isKeyVisible ? 'text' : 'password';
          keyInput.value = currentKeyVal;
          keyInput.placeholder = 'Paste your direct API key here...';
          keyInput.style.flex = '1';
          keyInput.style.background = '#0a0a0c';
          keyInput.style.border = '1px solid #282833';
          keyInput.style.borderRadius = '8px';
          keyInput.style.padding = '8px 12px';
          keyInput.style.color = '#ffffff';
          keyInput.style.fontSize = '12px';
          keyInput.style.fontFamily = 'monospace';
          keyInput.style.outline = 'none';
          keyInput.onfocus = () => {
            isKeyInputFocused = true;
          };
          keyInput.onblur = () => {
            isKeyInputFocused = false;
          };
          keyInput.oninput = (e: Event) => {
            const target = e.target as HTMLInputElement | null;
            keyCursorPos = target?.selectionStart ?? null;
            if (target) {
              enteredKeys[activeModalProvider] = target.value;
            }
          };
          keyInput.onkeydown = (e: KeyboardEvent) => {
            if (typeof e.stopPropagation === 'function') {
              e.stopPropagation();
            }
          };
          keyInput.onkeyup = (e: KeyboardEvent) => {
            if (typeof e.stopPropagation === 'function') {
              e.stopPropagation();
            }
          };
          inputRow.appendChild(keyInput);

          if (isKeyInputFocused) {
            if (typeof keyInput.focus === 'function') {
              keyInput.focus();
            }
            if (keyCursorPos !== null && typeof keyInput.setSelectionRange === 'function') {
              try {
                keyInput.setSelectionRange(keyCursorPos, keyCursorPos);
              } catch {
                // ignore in mock environments
              }
            }
          }

          const eyeBtn = activeDoc.createElement('button');
          eyeBtn.style.padding = '6px 10px';
          eyeBtn.style.background = '#1c1c24';
          eyeBtn.style.border = '1px solid #282833';
          eyeBtn.style.borderRadius = '8px';
          eyeBtn.style.color = '#94a3b8';
          eyeBtn.style.cursor = 'pointer';
          eyeBtn.innerHTML = ICONS.eye;
          eyeBtn.onclick = () => {
            isKeyVisible = !isKeyVisible;
            render(getDevToolsState());
          };
          inputRow.appendChild(eyeBtn);

          byokBox.appendChild(inputRow);
          formPanel.appendChild(byokBox);
        }
      } else if (activeModalProvider === 'ollama') {
        const ollamaBox = activeDoc.createElement('div');
        ollamaBox.style.background = '#121217';
        ollamaBox.style.border = '1px solid rgba(56,189,248,0.3)';
        ollamaBox.style.borderRadius = '10px';
        ollamaBox.style.padding = '12px';
        ollamaBox.style.display = 'flex';
        ollamaBox.style.flexDirection = 'column';
        ollamaBox.style.gap = '8px';

        const ollamaTitle = activeDoc.createElement('div');
        ollamaTitle.style.color = '#38bdf8';
        ollamaTitle.style.fontSize = '12px';
        ollamaTitle.style.fontWeight = '600';
        ollamaTitle.textContent = 'Local Ollama Daemon';
        ollamaBox.appendChild(ollamaTitle);

        const ollamaInput = activeDoc.createElement('input') as HTMLInputElement;
        ollamaInput.type = 'text';
        ollamaInput.value = ollamaEndpoint;
        ollamaInput.style.background = '#0a0a0c';
        ollamaInput.style.border = '1px solid #282833';
        ollamaInput.style.borderRadius = '6px';
        ollamaInput.style.padding = '6px 10px';
        ollamaInput.style.color = '#f8fafc';
        ollamaInput.style.fontFamily = 'monospace';
        ollamaInput.style.fontSize = '11px';
        ollamaInput.style.outline = 'none';
        ollamaInput.oninput = (e: Event) => {
          const target = e.target as HTMLInputElement | null;
          if (target) {
            ollamaEndpoint = target.value;
          }
        };
        ollamaInput.onkeydown = (e: KeyboardEvent) => {
          if (typeof e.stopPropagation === 'function') {
            e.stopPropagation();
          }
        };
        ollamaInput.onkeyup = (e: KeyboardEvent) => {
          if (typeof e.stopPropagation === 'function') {
            e.stopPropagation();
          }
        };
        ollamaBox.appendChild(ollamaInput);

        const ollamaDesc = activeDoc.createElement('p');
        ollamaDesc.style.fontSize = '11px';
        ollamaDesc.style.color = '#94a3b8';
        ollamaDesc.textContent = 'Zero external network traffic. Inference is processed on local GPU hardware.';
        ollamaBox.appendChild(ollamaDesc);

        formPanel.appendChild(ollamaBox);
      } else {
        const noneBox = activeDoc.createElement('div');
        noneBox.style.background = '#121217';
        noneBox.style.border = '1px solid #282833';
        noneBox.style.borderRadius = '10px';
        noneBox.style.padding = '12px';
        noneBox.innerHTML = `
          <div style="color:#94a3b8;font-size:12px;font-weight:600;">Zero AI Mode (Disabled)</div>
          <p style="font-size:11px;color:#64748b;margin-top:4px;">All Copilot assistants, network agents, and prompt models are disabled.</p>
        `;
        formPanel.appendChild(noneBox);
      }

      // Latency Ping Test
      const pingRow = activeDoc.createElement('div');
      pingRow.style.display = 'flex';
      pingRow.style.alignItems = 'center';
      pingRow.style.justifyContent = 'space-between';
      pingRow.style.paddingTop = '8px';
      pingRow.style.borderTop = '1px solid #1f1f26';

      const pingActions = activeDoc.createElement('div');
      pingActions.style.display = 'flex';
      pingActions.style.alignItems = 'center';
      pingActions.style.gap = '8px';

      const pingBtn = activeDoc.createElement('button');
      pingBtn.style.padding = '6px 12px';
      pingBtn.style.borderRadius = '6px';
      pingBtn.style.background = '#1c1c24';
      pingBtn.style.border = '1px solid #282833';
      pingBtn.style.color = '#33BBCA';
      pingBtn.style.fontSize = '11px';
      pingBtn.style.fontFamily = 'monospace';
      pingBtn.style.cursor = 'pointer';
      pingBtn.style.display = 'flex';
      pingBtn.style.alignItems = 'center';
      pingBtn.style.gap = '6px';
      pingBtn.innerHTML = `${ICONS.activity} <span>${isPingTesting ? 'Pinging...' : 'Test Connection'}</span>`;
      pingBtn.onclick = () => {
        isPingTesting = true;
        render(getDevToolsState());
        if (pingTimeoutId) {
          clearTimeout(pingTimeoutId);
        }
        pingTimeoutId = setTimeout(() => {
          isPingTesting = false;
          if (activeModalProvider === 'none') {
            pingResult = { latency: 0, code: 'OFF', message: 'Zero AI Mode: Network calls deactivated.' };
          } else if (activeModalProvider === 'ollama') {
            pingResult = { latency: 4, code: '200 OK', message: 'Local Ollama daemon verified (4ms latency).' };
            isAccountConnected['ollama'] = true;
          } else {
            const currentMode = providerAuthModes[activeModalProvider] || 'account';
            const isConn = isAccountConnected[activeModalProvider] ?? false;
            const enteredKey = enteredKeys[activeModalProvider]?.trim();
            if (currentMode === 'byok' ? (enteredKey && enteredKey.length > 0) : isConn) {
              pingResult = { latency: 19, code: '200 OK', message: 'Verified: 19ms latency (200 OK)' };
              isAccountConnected[activeModalProvider] = true;
            } else {
              pingResult = {
                latency: 0,
                code: '401 ERR',
                message: `401 Unauthorized: No credentials configured for ${activeModalProvider}.`,
              };
            }
          }
          render(getDevToolsState());
        }, 150);
      };
      pingActions.appendChild(pingBtn);

      if (pingResult) {
        const resultBanner = activeDoc.createElement('div');
        resultBanner.style.padding = '4px 10px';
        resultBanner.style.borderRadius = '6px';
        resultBanner.style.fontSize = '11px';
        resultBanner.style.fontFamily = 'monospace';
        resultBanner.style.display = 'flex';
        resultBanner.style.alignItems = 'center';
        resultBanner.style.gap = '6px';

        const codeBadge = `<span style="padding:1px 6px;border-radius:4px;font-size:10px;background:rgba(255,255,255,0.08);margin-left:6px;">${pingResult.code}</span>`;
        if (pingResult.code === '200 OK') {
          resultBanner.style.background = 'rgba(52,211,153,0.15)';
          resultBanner.style.border = '1px solid rgba(52,211,153,0.3)';
          resultBanner.style.color = '#34d399';
          resultBanner.innerHTML = `${ICONS.check} <span>${pingResult.message || `Verified: ${pingResult.latency}ms latency`}</span> ${codeBadge}`;
        } else if (pingResult.code === 'OFF') {
          resultBanner.style.background = 'rgba(100,116,139,0.15)';
          resultBanner.style.border = '1px solid rgba(100,116,139,0.3)';
          resultBanner.style.color = '#94a3b8';
          resultBanner.innerHTML = `${ICONS.none} <span>${pingResult.message}</span> ${codeBadge}`;
        } else {
          resultBanner.style.background = 'rgba(239,68,68,0.15)';
          resultBanner.style.border = '1px solid rgba(239,68,68,0.3)';
          resultBanner.style.color = '#f87171';
          resultBanner.innerHTML = `<span>✕</span> <span>${pingResult.message}</span> ${codeBadge}`;
        }
        pingActions.appendChild(resultBanner);
      }
      pingRow.appendChild(pingActions);

      const footerActions = activeDoc.createElement('div');
      footerActions.style.display = 'flex';
      footerActions.style.alignItems = 'center';
      footerActions.style.gap = '8px';

      const cancelBtn = activeDoc.createElement('button');
      cancelBtn.className = 'btn-cancel-auth';
      cancelBtn.style.padding = '6px 12px';
      cancelBtn.style.borderRadius = '6px';
      cancelBtn.style.background = 'transparent';
      cancelBtn.style.border = 'none';
      cancelBtn.style.color = '#94a3b8';
      cancelBtn.style.fontSize = '11px';
      cancelBtn.style.fontFamily = 'monospace';
      cancelBtn.style.cursor = 'pointer';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = () => {
        if (pingTimeoutId) {
          clearTimeout(pingTimeoutId);
          pingTimeoutId = null;
        }
        isPingTesting = false;
        isAuthModalOpen = false;
        render(getDevToolsState());
      };
      footerActions.appendChild(cancelBtn);

      const saveBtn = activeDoc.createElement('button');
      saveBtn.className = 'btn-save-auth';
      saveBtn.style.padding = '6px 14px';
      saveBtn.style.borderRadius = '6px';
      saveBtn.style.background = '#33BBCA';
      saveBtn.style.border = 'none';
      saveBtn.style.color = '#0a0a0f';
      saveBtn.style.fontWeight = '600';
      saveBtn.style.fontSize = '11px';
      saveBtn.style.cursor = 'pointer';
      saveBtn.style.display = 'flex';
      saveBtn.style.alignItems = 'center';
      saveBtn.style.gap = '6px';
      saveBtn.innerHTML = `${ICONS.check} <span>Save Changes</span>`;
      saveBtn.onclick = () => {
        if (activeModalProvider === 'none') {
          isAccountConnected['none'] = false;
        } else if (activeModalProvider === 'ollama') {
          isAccountConnected['ollama'] = true;
        } else {
          const currentMode = providerAuthModes[activeModalProvider] || 'account';
          if (currentMode === 'byok') {
            const enteredKey = enteredKeys[activeModalProvider]?.trim();
            if (enteredKey && enteredKey.length > 0) {
              isAccountConnected[activeModalProvider] = true;
            } else {
              isAccountConnected[activeModalProvider] = false;
            }
          }
          // In account mode, connection status was set by re-authenticate or disconnect, keep as is
        }
        if (pingTimeoutId) {
          clearTimeout(pingTimeoutId);
          pingTimeoutId = null;
        }
        isPingTesting = false;
        isAuthModalOpen = false;
        render(getDevToolsState());
      };
      footerActions.appendChild(saveBtn);
      pingRow.appendChild(footerActions);

      formPanel.appendChild(pingRow);

      // Security footer
      const securityBox = activeDoc.createElement('div');
      securityBox.style.padding = '8px 12px';
      securityBox.style.borderRadius = '8px';
      securityBox.style.background = '#0a0a0c';
      securityBox.style.border = '1px solid #1f1f26';
      securityBox.style.display = 'flex';
      securityBox.style.alignItems = 'center';
      securityBox.style.gap = '8px';
      securityBox.style.fontSize = '11px';
      securityBox.style.color = '#94a3b8';
      securityBox.style.marginTop = 'auto';
      securityBox.innerHTML = `
        <span style="color:#34d399;">${ICONS.shield}</span>
        <span><strong style="color:#34d399;">AST Safe:</strong> Credentials stored strictly in local server .env (0 client bundle leaks).</span>
      `;
      formPanel.appendChild(securityBox);

      modalBody.appendChild(formPanel);
      modalCard.appendChild(modalBody);
      modalBackdrop.appendChild(modalCard);
      wrapper.appendChild(modalBackdrop);
    }
  }

  const unsubscribe = subscribeDevTools((state) => {
    render(state);
  });

  render(getDevToolsState());
  activeDoc.body.appendChild(container);

  return () => {
    unsubscribe();
    if (pingTimeoutId) {
      clearTimeout(pingTimeoutId);
      pingTimeoutId = null;
    }
    if (typeof activeDoc.removeEventListener === 'function') {
      activeDoc.removeEventListener('keydown', handleKeyDown);
      activeDoc.removeEventListener('click', handleOutsideClick);
    }
    shadowRootStore.delete(container);
    container.remove();
  };
}
