import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './premium.css';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Grid,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Timeline,
  Typography
} from 'antd';
import {
  BarChartOutlined,
  CreditCardOutlined,
  DollarCircleOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  HistoryOutlined,
  LogoutOutlined,
  MenuOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import api from './services/api';

// Formata data sem perda de dia por timezone (UTC-3 Brasília)
function formatDate(dayjsObj) {
  if (!dayjsObj) return null;
  const y = dayjsObj.year();
  const m = String(dayjsObj.month() + 1).padStart(2, '0');
  const d = String(dayjsObj.date()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


// ── Colunas redimensionáveis ──────────────────────────────────────
function ResizableTitle({ onResize, width, ...restProps }) {
  if (!width) return <th {...restProps} />;
  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e) => e.stopPropagation()}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
}

function useResizableColumns(initialColumns) {
  const [columns, setColumns] = React.useState(initialColumns);

  React.useEffect(() => {
    setColumns(initialColumns);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialColumns.map(c => c.title))]);

  const handleResize = (index) => (_, { size }) => {
    setColumns((cols) => {
      const next = [...cols];
      next[index] = { ...next[index], width: Math.max(size.width, 60) };
      return next;
    });
  };

  const resizableColumns = columns.map((col, index) => ({
    ...col,
    onHeaderCell: (column) => ({
      width: column.width,
      onResize: handleResize(index),
    }),
  }));

  return resizableColumns;
}

function PageHeader({ title, subtitle, extra }) {
  return (
    <div className="page-header-wrap">
      <div>
        <div className="page-header-title">{title}</div>
        {subtitle && <div className="page-header-subtitle">{subtitle}</div>}
      </div>
      {extra && <div style={{ flexShrink: 0 }}>{extra}</div>}
    </div>
  );
}

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
const { RangePicker } = DatePicker;

const money = (value) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dateBR = (value) => (value ? dayjs.utc(value).format('DD/MM/YYYY') : '-');
const dateTimeBR = (value) => (value ? dayjs.utc(value).format('DD/MM/YYYY HH:mm') : '-');
const ageFromDate = (value) => (value ? dayjs().diff(dayjs(value), 'year') : 0);

const initialCustomer = {
  cpf: '',
  name: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  birthDate: null,
  phone1: '',
  phone2: '',
  monthlyIncome: 0,
  residenceMonths: 0,
  status: 'ATIVO',
  notes: ''
};

const initialContract = {
  customerId: '',
  product: '',
  quantity: 1,
  financedAmount: 0,
  installmentCount: 1,
  contractStartDate: null,
  interestRate: 0,
  notes: '',
  status: 'ATIVO',
  promisedPaymentDate: null,
  promisedPaymentValue: null,
  collectionNote: ''
};

const initialPayment = {
  contractId: '',
  installmentId: null,
  collectorId: '',
  amount: 0,
  paymentDate: dayjs(),
  paymentMethod: 'PIX',
  notes: ''
};

const initialUser = {
  name: '',
  email: '',
  password: '',
  role: 'COLLECTOR',
  isActive: true
};

const initialRenegotiation = {
  installmentCount: 1,
  contractStartDate: dayjs(),
  interestRate: 0,
  notes: ''
};

function MobileItemCard({ title, children, extra }) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Space
          align="start"
          style={{ width: '100%', justifyContent: 'space-between' }}
          wrap
        >
          <Typography.Title level={5} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {extra}
        </Space>
        {children}
      </Space>
    </Card>
  );
}

function statusColorCustomer(status) {
  if (status === 'ATIVO') return 'green';
  if (status === 'INADIMPLENTE') return 'red';
  return 'gold';
}

function statusColorContract(status) {
  if (status === 'QUITADO') return 'green';
  if (status === 'ATRASADO') return 'red';
  if (status === 'RENEGOCIADO') return 'purple';
  return 'blue';
}

function statusColorInstallment(status) {
  if (status === 'PAGA') return 'green';
  if (status === 'ATRASADA') return 'red';
  if (status === 'PARCIAL') return 'blue';
  return 'gold';
}


// ── Componente wrapper que aplica resize em qualquer tabela ───────
function ResizableTable({ columns: rawColumns, ...tableProps }) {
  const cols = useResizableColumns(rawColumns);
  return (
    <Table
      {...tableProps}
      columns={cols}
      components={{
        header: { cell: ResizableTitle }
      }}
    />
  );
}

// Wrapper que garante AntApp sempre presente

// ── Componente de Histórico com Estorno e Exclusão ───────────
function HistoryTable({ target, products, baskets, api, money, dateBR, ant, onRefresh }) {
  const [movements, setMovements] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState(undefined);
  const [selectedType, setSelectedType] = React.useState(undefined);

  async function load() {
    try {
      setLoading(true);
      const endpoint = target === 'stock' ? '/stock/movements' : '/baskets/history';
      const params = {};
      if (selectedProduct) params[target === 'stock' ? 'productId' : 'basketId'] = selectedProduct;
      if (selectedType) params.type = selectedType;
      const res = await api.get(endpoint, { params });
      setMovements(res.data || []);
    } catch {
      ant.message.error('Erro ao carregar histórico.');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); }, [selectedProduct, selectedType, target]);

  // Carregar ao montar (destroyOnClose garante que remonta ao abrir)
  React.useEffect(() => { load(); }, []);

  // Estorno — reverte o estoque
  async function handleReverse(item) {
    try {
      const ep = target === 'stock'
        ? `/stock/movements/${item.id}/reverse`
        : `/baskets/movements/${item.id}/reverse`;
      await api.post(ep);
      ant.message.success('Estorno realizado.', 2);
      load(); onRefresh(target);
    } catch (err) {
      ant.message.error(err?.response?.data?.message || 'Erro ao estornar.');
    }
  }

  // Excluir — faz estorno, remove o registro e limpa estornos do histórico
  async function handleDelete(item) {
    try {
      const epDelete = target === 'stock'
        ? `/stock/movements/${item.id}/delete-with-reverse`
        : `/baskets/movements/${item.id}/delete-with-reverse`;
      await api.delete(epDelete);
      ant.message.success('Excluído e estoque revertido.', 2);
      load(); onRefresh(target);
    } catch (err) {
      ant.message.error(err?.response?.data?.message || 'Erro ao excluir.');
    }
  }

  const typeColors = {
    ENTRADA: 'green', SAIDA: 'blue', AVARIA: 'orange', TROCA: 'purple',
    AJUSTE_POSITIVO: 'cyan', AJUSTE_NEGATIVO: 'volcano', ESTORNO: 'default',
    MONTAGEM: 'green', VENDA: 'blue', DESMONTAGEM: 'purple',
  };

  const itemOptions = target === 'stock'
    ? products.map(p => ({ value: p.id, label: p.name }))
    : baskets.map(b => ({ value: b.id, label: b.name }));

  const typeOptions = target === 'stock'
    ? ['ENTRADA', 'SAIDA', 'AVARIA', 'TROCA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'ESTORNO']
    : ['MONTAGEM', 'VENDA', 'DESMONTAGEM', 'AVARIA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'ESTORNO'];

  return (
    <div>
      {/* Filtros compactos */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          allowClear showSearch optionFilterProp="label"
          placeholder={target === 'stock' ? 'Produto...' : 'Cesta...'}
          size="small" style={{ flex: 1, minWidth: 140 }}
          value={selectedProduct} onChange={setSelectedProduct}
          options={itemOptions}
        />
        <Select
          allowClear placeholder="Tipo..." size="small" style={{ width: 140 }}
          value={selectedType} onChange={setSelectedType}
          options={typeOptions.map(t => ({ value: t, label: t }))}
        />
        <Button size="small" onClick={load} loading={loading}>↺</Button>
        <span style={{ fontSize: 11, color: 'var(--slate-400)' }}>{movements.length} registros</span>
      </div>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={movements}
        pagination={{ pageSize: 8, size: 'small' }}
        scroll={{ x: 600 }}
        columns={[
          {
            title: 'Data / Tipo',
            width: 130,
            render: (_, r) => (
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 500 }}>{dateBR(r.createdAt)}</div>
                <Tag color={typeColors[r.type] || 'default'} style={{ fontSize: 10, marginTop: 2, padding: '0 5px' }}>{r.type}</Tag>
              </div>
            )
          },
          {
            title: target === 'stock' ? 'Produto' : 'Cesta',
            render: (_, r) => (
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{r.product?.name || r.basket?.name || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--slate-400)' }}>{r.destination || r.reason || ''}</div>
              </div>
            )
          },
          {
            title: 'Qtd',
            align: 'center', width: 50,
            render: (_, r) => (
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{r.quantity}</span>
            )
          },
          {
            title: 'Custo total',
            align: 'right', width: 100,
            render: (_, r) => (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{money(r.quantity * r.unitCost)}</div>
                <div style={{ fontSize: 10, color: 'var(--slate-400)' }}>{money(r.unitCost)}/un</div>
              </div>
            )
          },
          {
            title: 'Venda total',
            align: 'right', width: 100,
            render: (_, r) => r.salePrice ? (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: 'var(--blue-600)' }}>{money(r.quantity * r.salePrice)}</div>
                <div style={{ fontSize: 10, color: 'var(--slate-400)' }}>{money(r.salePrice)}/un</div>
              </div>
            ) : <span style={{ color: 'var(--slate-300)' }}>—</span>
          },
          {
            title: '',
            width: 90,
            render: (_, r) => r.type === 'ESTORNO' ? null : (
              <Space size={3}>
                <Popconfirm
                  title="Estornar?"
                  description="Reverte o estoque."
                  onConfirm={() => handleReverse(r)}
                  okText="Sim" cancelText="Não"
                >
                  <Button size="small" style={{ fontSize: 11, borderColor: 'var(--amber-500)', color: 'var(--amber-500)', padding: '0 7px' }}>
                    ↩
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="Excluir?"
                  description="Estorna e remove o registro."
                  onConfirm={() => handleDelete(r)}
                  okText="Sim" cancelText="Não"
                  okButtonProps={{ danger: true }}
                >
                  <Button size="small" danger style={{ fontSize: 11, padding: '0 7px' }}>✕</Button>
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />
    </div>
  );
}


const MiPixiLogo = ({ width = 200, height = 50 }) => (
  <svg width={width} height={height} viewBox="0 0 300 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3B82F6" />
        <stop offset="100%" stopColor="#8B5CF6" />
      </linearGradient>
    </defs>
    <g transform="translate(10, 5) scale(0.9)">
      <path d="M 15 50 L 30 15 L 50 40 L 70 15 L 90 35 L 70 55 L 50 40 L 30 65 L 50 85 L 85 80" stroke="url(#grad1)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M 15 50 L 30 65" stroke="url(#grad1)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 6" fill="none"/>
      <path d="M 70 15 L 70 55" stroke="url(#grad1)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 6" fill="none"/>
      <circle cx="15" cy="50" r="4" fill="#3B82F6"/>
      <circle cx="30" cy="15" r="5" fill="#ffffff" stroke="url(#grad1)" strokeWidth="3"/>
      <circle cx="50" cy="40" r="6" fill="#8B5CF6"/>
      <circle cx="70" cy="15" r="5" fill="#ffffff" stroke="url(#grad1)" strokeWidth="3"/>
      <circle cx="90" cy="35" r="4" fill="#8B5CF6"/>
      <circle cx="70" cy="55" r="4" fill="#3B82F6"/>
      <circle cx="30" cy="65" r="4" fill="#ffffff" stroke="url(#grad1)" strokeWidth="3"/>
      <circle cx="50" cy="85" r="5" fill="#ffffff" stroke="url(#grad1)" strokeWidth="3"/>
      <circle cx="85" cy="80" r="4" fill="#3B82F6"/>
    </g>
    <text x="105" y="65" fontFamily="'Outfit', sans-serif" fontSize="42" fontWeight="900" fill="#3B82F6">Mi<tspan fontWeight="300" fill="#c084fc">Pixi</tspan></text>
  </svg>
);

export default function App() {
  return (
    <AntApp>
      <AppContent />
    </AntApp>
  );
}

function AppContent() {
  const screens = useBreakpoint();
  const isMobile = !screens.lg;

  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  });
  const [current, setCurrent] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [summary, setSummary] = useState({
    valueOpenMonth: 0,
    valueReceivedMonth: 0,
    missingToReceiveMonth: 0,
    overdueInstallments: 0,
    customersInArrears: 0,
    collectorsDaily: [],
    assignmentsToday: 0,
    customersCount: 0,
    contractsCount: 0,
    totalSold: 0,
    overdueCount: 0,
    ticketAverage: 0
  });

  const [customers, setCustomers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [users, setUsers] = useState([]);
  const [distributionCollectors, setDistributionCollectors] = useState([]);
  const [availableContracts, setAvailableContracts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [stockSummary, setStockSummary] = useState(null);
  const [stockMovements, setStockMovements] = useState([]);
  const [stockMonth, setStockMonth] = useState(dayjs());
  const [stockLoading, setStockLoading] = useState(false);
  const [baskets, setBaskets] = useState([]);
  const [basketSummary, setBasketSummary] = useState(null);
  const [basketMovements, setBasketMovements] = useState([]);
  const [basketMonth, setBasketMonth] = useState(dayjs());
  const [basketLoading, setBasketLoading] = useState(false);
  const [basketDrawer, setBasketDrawer] = useState({ open: false, item: null });
  const [basketMovementModal, setBasketMovementModal] = useState({ open: false, type: 'MONTAGEM' });
  const [adjustModal, setAdjustModal] = useState({ open: false, target: 'stock', item: null });
  const [editMovementModal, setEditMovementModal] = useState({ open: false, target: 'stock', item: null });
  const [historyModal, setHistoryModal] = useState({ open: false, target: 'stock' });
  const [unitFilter, setUnitFilter] = useState('');
  const [spcRecords, setSpcRecords] = useState([]);
  const [spcSummary, setSpcSummary] = useState(null);
  const [spcLoading, setSpcLoading] = useState(false);
  const [spcDrawer, setSpcDrawer] = useState({ open: false, item: null });
  const [spcBaixarModal, setSpcBaixarModal] = useState({ open: false, item: null });
  const [spcAcordoModal, setSpcAcordoModal] = useState({ open: false, item: null });
  const [basketItems, setBasketItems] = useState([]);
  const [selectedContractProduct, setSelectedContractProduct] = useState(null);
  const [contractUnitType, setContractUnitType] = useState('unit'); // 'unit' | 'package'
  const [productDrawer, setProductDrawer] = useState({ open: false, item: null });
  const [movementModal, setMovementModal] = useState({ open: false, type: 'ENTRADA' });

  const [cashMonth, setCashMonth] = useState(dayjs());
  const [cashCollectorId, setCashCollectorId] = useState(undefined);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [cashLoading, setCashLoading] = useState(false);

  const [selectedInstallment, setSelectedInstallment] = useState(null);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('');
  const [contractSearch, setContractSearch] = useState('');
  const [contractStatusFilter, setContractStatusFilter] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentDateRange, setPaymentDateRange] = useState(null);

  const [loginForm] = Form.useForm();
  const [customerForm] = Form.useForm();
  const [contractForm] = Form.useForm();
  const [paymentForm] = Form.useForm();
  const [userForm] = Form.useForm();
  const [renegotiationForm] = Form.useForm();
  const [productForm] = Form.useForm();
  const [movementForm] = Form.useForm();
  const [basketForm] = Form.useForm();
  const [basketMovementForm] = Form.useForm();
  const [adjustForm] = Form.useForm();
  const [spcForm] = Form.useForm();
  const [spcBaixarForm] = Form.useForm();
  const [spcAcordoForm] = Form.useForm();
  const spcWatchedCustomerId = Form.useWatch('customerId', spcForm);
  const [editMovementForm] = Form.useForm();

  const [customerDrawer, setCustomerDrawer] = useState({ open: false, item: null });
  const [contractDrawer, setContractDrawer] = useState({ open: false, item: null });
  const [paymentModal, setPaymentModal] = useState({ open: false, item: null });
  const [userDrawer, setUserDrawer] = useState({ open: false, item: null });
  const [bulkDrawer, setBulkDrawer] = useState({ open: false, collector: null });
  const [selectedContractIds, setSelectedContractIds] = useState([]);
  const [paymentInstallmentsModal, setPaymentInstallmentsModal] = useState({
    open: false,
    contractId: null
  });

  const [customerProfileModal, setCustomerProfileModal] = useState({
    open: false,
    loading: false,
    customerId: null,
    data: null
  });

  const [renegotiationModal, setRenegotiationModal] = useState({
    open: false,
    contract: null
  });

  // ant.message seguro — funciona mesmo fora de contexto AntApp
  const antRaw = AntApp.useApp();
  const ant = {
    message: {
      error: (msg) => antRaw?.message?.error?.(msg) ?? console.error(msg),
      success: (msg) => antRaw?.message?.success?.(msg) ?? console.log(msg),
      warning: (msg) => antRaw?.message?.warning?.(msg) ?? console.warn(msg),
    },
    modal: {
      success: (opts) => antRaw?.modal?.success?.(opts),
      error: (opts) => antRaw?.modal?.error?.(opts),
      confirm: (opts) => antRaw?.modal?.confirm?.(opts),
    }
  };
  const isAdmin = user?.role === 'ADMIN';
  const isCollector = user?.role === 'COLLECTOR';

  const drawerWidth = isMobile ? '100%' : 680;
  const contractDrawerWidth = isMobile ? '100%' : 760;
  const paymentModalWidth = isMobile ? '96%' : 620;
  const installmentsModalWidth = isMobile ? '96%' : 1100;
  const userDrawerWidth = isMobile ? '100%' : 560;
  const bulkDrawerWidth = isMobile ? '100%' : 900;
  const profileModalWidth = isMobile ? '96%' : 1200;
  const renegotiationModalWidth = isMobile ? '96%' : 640;

  const selectedPaymentContract = useMemo(() => {
    if (!paymentInstallmentsModal.contractId) return null;
    return contracts.find((c) => c.id === paymentInstallmentsModal.contractId) || null;
  }, [contracts, paymentInstallmentsModal.contractId]);

  const menuItems = useMemo(() => {
    const mi = (emoji) => <span style={{ fontSize: 15 }}>{emoji}</span>;

    if (isCollector) {
      return [
        { key: 'cobranca', icon: mi('💰'), label: 'Cobrança' }
      ];
    }

    const base = [
      { key: 'dashboard',  icon: mi('📊'), label: 'Resumo' },
      { key: 'customers',  icon: mi('👥'), label: 'Clientes' },
      { key: 'contracts',  icon: mi('📄'), label: 'Contratos' },
      { key: 'payments',   icon: mi('💳'), label: 'Pagamentos' }
    ];

    if (isAdmin) {
      base.splice(3, 0, {
        key: 'assignments',
        icon: mi('🗂️'),
        label: 'Distribuição'
      });
      base.push({ key: 'users',         icon: mi('🔐'), label: 'Usuários' });
      base.push({ key: 'cashAccounts',  icon: mi('📑'), label: 'Prestação de contas' });
      base.push({ key: 'estoque',       icon: mi('📦'), label: 'Estoque' });
      base.push({ key: 'cestas',        icon: mi('🧺'), label: 'Cestas Básicas' });
      base.push({ key: 'spc',           icon: mi('⚠️'), label: 'SPC' });
      base.push({ key: 'audit',         icon: mi('🔍'), label: 'Auditoria' });
    }

    return base;
  }, [isAdmin, isCollector]);

  const loadAll = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);

      // Cobrador: endpoint dedicado e otimizado
      if (isCollector) {
        const dashRes = await api.get('/collector/dashboard');
        setContracts(dashRes.data || []);
        setCustomers([]);
        setPayments([]);
        setCollectors([]);
        setUsers([]);
        setDistributionCollectors([]);
        setAvailableContracts([]);
        setAuditLogs([]);
        setProducts([]);
        return;
      }

      const calls = [
        api.get('/dashboard/summary'),
        api.get('/customers'),
        api.get('/contracts')
      ];

      calls.push(api.get('/payments'));

      if (isAdmin) {
        calls.push(api.get('/collectors'));
        calls.push(api.get('/users'));
        calls.push(api.get('/distribution/collectors'));
        calls.push(api.get('/distribution/available-contracts'));
        calls.push(api.get('/audit-logs'));
      }

      const responses = await Promise.all(calls);

      let idx = 0;
      setSummary(responses[idx++].data);
      setCustomers(responses[idx++].data || []);
      setContracts(responses[idx++].data || []);

      setPayments(responses[idx++].data || []);

      if (isAdmin) {
        setCollectors(responses[idx++].data || []);
        setUsers(responses[idx++].data || []);
        setDistributionCollectors(responses[idx++].data || []);
        setAvailableContracts(responses[idx++].data || []);
        setAuditLogs(responses[idx++].data || []);
        // Produtos e cestas carregados separadamente
        try {
          const prodRes = await api.get('/products');
          setProducts(prodRes.data || []);
        } catch {
          setProducts([]);
        }
        try {
          const basketRes = await api.get('/baskets');
          setBaskets(basketRes.data || []);
        } catch {
          setBaskets([]);
        }
        try {
          const [spcRes, spcSumRes] = await Promise.all([api.get('/spc'), api.get('/spc/summary')]);
          setSpcRecords(spcRes.data || []);
          setSpcSummary(spcSumRes.data);
        } catch { setSpcRecords([]); }
      } else {
        setCollectors([]);
        setUsers([]);
        setDistributionCollectors([]);
        setAvailableContracts([]);
        setAuditLogs([]);
        setProducts([]);
      }
    } catch (error) {
      console.error('loadAll error:', error?.response?.data?.message || error?.message);
      // Não usar ant.message aqui para evitar loop
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin, isCollector]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const q = customerSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        customer.name?.toLowerCase().includes(q) ||
        customer.cpf?.includes(q);

      const matchesStatus = !customerStatusFilter || customer.status === customerStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [customers, customerSearch, customerStatusFilter]);

  const filteredContracts = useMemo(() => {
    return contracts.filter((contract) => {
      const q = contractSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        contract.customer?.name?.toLowerCase().includes(q) ||
        contract.customer?.cpf?.includes(q) ||
        contract.product?.toLowerCase().includes(q);

      const matchesStatus = !contractStatusFilter || contract.status === contractStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contracts, contractSearch, contractStatusFilter]);

  // CORRIGIDO: lógica de filtro de data estava com ternário errado
  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const q = paymentSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        payment.contract?.customer?.name?.toLowerCase().includes(q) ||
        payment.contract?.customer?.cpf?.includes(q) ||
        payment.contract?.product?.toLowerCase().includes(q);

      let matchesDate = true;
      if (paymentDateRange?.length === 2) {
        const start = paymentDateRange[0].startOf('day');
        const end = paymentDateRange[1].endOf('day');
        const curr = dayjs.utc(payment.paymentDate);
        matchesDate = (curr.isAfter(start) || curr.isSame(start)) &&
                      (curr.isBefore(end) || curr.isSame(end));
      }

      return matchesSearch && matchesDate;
    });
  }, [payments, paymentSearch, paymentDateRange]);

  function persistAuth(nextToken, nextUser) {
    localStorage.setItem('token', nextToken);
    localStorage.setItem('user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  async function onLogin(values) {
    try {
      setLoading(true);
      const { data } = await api.post('/auth/login', values);
      persistAuth(data.token, data.user);
      setCurrent(data.user.role === 'COLLECTOR' ? 'cobranca' : 'dashboard');
      ant.message.success(`Bem-vindo, ${data.user.name}`);
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Falha no login.');
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setCurrent('dashboard');
    setMobileMenuOpen(false);
  }

  function openCustomer(item = null) {
    setCustomerDrawer({ open: true, item });
    customerForm.setFieldsValue(
      item ? { ...item, birthDate: dayjs.utc(item.birthDate) } : initialCustomer
    );
  }

  function openContract(item = null) {
    setContractDrawer({ open: true, item });
    contractForm.setFieldsValue(
      item
        ? {
            ...item,
            contractStartDate: item.contractStartDate ? dayjs.utc(item.contractStartDate) : null,
            promisedPaymentDate: item.promisedPaymentDate ? dayjs.utc(item.promisedPaymentDate) : null,
            sellerId: item.sellerId || item.seller?.id || undefined
          }
        : initialContract
    );
  }

  function openPayment(item = null) {
    setSelectedInstallment(null);
    setPaymentModal({ open: true, item });

    if (item) {
      paymentForm.setFieldsValue({
        contractId: item.contractId,
        // CORRIGIDO: collectorId vem do objeto collector aninhado
        collectorId: item.collectorId || item.collector?.id || '',
        amount: item.amount,
        paymentDate: item.paymentDate ? dayjs.utc(item.paymentDate) : dayjs(),
        paymentMethod: item.paymentMethod || 'PIX',
        notes: item.notes || ''
      });
    } else if (isCollector && user?.id) {
      paymentForm.setFieldsValue({
        ...initialPayment,
        collectorId: user?.id || ''
      });
    } else {
      paymentForm.setFieldsValue(initialPayment);
    }
  }

  function openPaymentByInstallment(contract, installment) {
    setSelectedInstallment({ contract, installment });
    setPaymentModal({ open: true, item: null });

    paymentForm.setFieldsValue({
      contractId: contract.id,
      installmentId: installment.id,
      collectorId: isCollector ? user?.id : '',
      amount: Number(
        (
          Number(installment.amount || 0) -
          Number(installment.paidAmount || 0)
        ).toFixed(2)
      ),
      paymentDate: dayjs(),
      paymentMethod: 'PIX',
      notes: `Pagamento da parcela ${installment.number}`
    });
  }

  function openUser(item = null) {
    setUserDrawer({ open: true, item });
    userForm.setFieldsValue(item ? { ...item, password: '' } : initialUser);
  }

  function openBulkDistribution(collector) {
    setBulkDrawer({ open: true, collector });
    setSelectedContractIds([]);
  }

  function closeBulkDrawer() {
    setBulkDrawer({ open: false, collector: null });
    setSelectedContractIds([]);
  }

  function openPaymentInstallments(contract) {
    setPaymentInstallmentsModal({ open: true, contractId: contract.id });
  }

  function closePaymentInstallmentsModal() {
    setPaymentInstallmentsModal({ open: false, contractId: null });
  }

  async function openCustomerProfile(customer) {
    try {
      setCustomerProfileModal({
        open: true,
        loading: true,
        customerId: customer.id,
        data: null
      });

      const { data } = await api.get(`/customers/${customer.id}/full`);

      setCustomerProfileModal({
        open: true,
        loading: false,
        customerId: customer.id,
        data
      });
    } catch (error) {
      setCustomerProfileModal({
        open: false,
        loading: false,
        customerId: null,
        data: null
      });
      ant.message.error(error?.response?.data?.message || 'Erro ao carregar ficha do cliente.');
    }
  }

  function closeCustomerProfile() {
    setCustomerProfileModal({
      open: false,
      loading: false,
      customerId: null,
      data: null
    });
  }

  function openRenegotiation(contract) {
    setRenegotiationModal({ open: true, contract });
    renegotiationForm.setFieldsValue({
      installmentCount: Math.max(contract.remainingInstallments || 1, 1),
      contractStartDate: dayjs(),
      interestRate: contract.interestRate || 0,
      notes: `Renegociação do contrato ${contract.product}`
    });
  }

  function closeRenegotiation() {
    setRenegotiationModal({ open: false, contract: null });
    renegotiationForm.resetFields();
  }

  function closeCustomerDrawer() {
    setCustomerDrawer({ open: false, item: null });
    customerForm.resetFields();
  }

  function closeContractDrawer() {
    setContractDrawer({ open: false, item: null });
    contractForm.resetFields();
  }

  function closePaymentModal() {
    setPaymentModal({ open: false, item: null });
    setSelectedInstallment(null);
    paymentForm.resetFields();
  }

  function closeUserDrawer() {
    setUserDrawer({ open: false, item: null });
    userForm.resetFields();
  }

  async function saveCustomer(values) {
    try {
      const payload = {
        ...values,
        birthDate: formatDate(values.birthDate)
      };

      if (customerDrawer.item) {
        await api.put(`/customers/${customerDrawer.item.id}`, payload);
      } else {
        await api.post('/customers', payload);
      }

      closeCustomerDrawer();
      await loadAll();
      ant.modal.success({
        title: 'Concluído',
        content: customerDrawer.item
          ? 'As alterações do cliente foram salvas com sucesso.'
          : 'O cliente foi cadastrado com sucesso.',
        centered: true
      });
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao salvar cliente.');
    }
  }

  async function saveContract(values) {
    try {
      const payload = {
        ...values,
        financedAmount: Number(values.financedAmount),
        quantity: (() => {
          const q = Number(values.quantity || 1);
          if (contractUnitType === 'package' && selectedContractProduct?.packageQty) {
            return q * selectedContractProduct.packageQty;
          }
          return q;
        })(),
        installmentCount: Number(values.installmentCount),
        interestRate: Number(values.interestRate),
        promisedPaymentValue: values.promisedPaymentValue != null ? Number(values.promisedPaymentValue) : null,
        contractStartDate: formatDate(values.contractStartDate),
        promisedPaymentDate: values.promisedPaymentDate
          ? formatDate(values.promisedPaymentDate)
          : null
      };

      if (!isAdmin) {
        delete payload.sellerId;
      }

      if (contractDrawer.item) {
        await api.put(`/contracts/${contractDrawer.item.id}`, payload);
      } else {
        await api.post('/contracts', payload);
      }

      closeContractDrawer();
      await loadAll();
      ant.message.success(
        contractDrawer.item
          ? 'Contrato atualizado com sucesso.'
          : 'Contrato cadastrado com sucesso.',
        2
      );
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao salvar contrato.');
    }
  }

  async function savePayment(values) {
    try {
      const payload = {
        ...values,
        paymentDate: formatDate(values.paymentDate),
        installmentId: values.installmentId || null
      };

      const isEditing = !!paymentModal.item;

      if (isEditing) {
        await api.put(`/payments/${paymentModal.item.id}`, payload);
      } else {
        await api.post('/payments', payload);
      }

      closePaymentModal();

      // Cobrador: reload via endpoint dedicado (rápido)
      if (isCollector) {
        const dashRes = await api.get('/collector/dashboard');
        setContracts(dashRes.data || []);
      } else {
        await loadAll();
      }

      ant.modal.success({
        title: 'Concluído',
        content: isEditing
          ? 'As alterações do pagamento foram salvas com sucesso.'
          : 'O pagamento foi cadastrado com sucesso.',
        centered: true
      });
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao salvar pagamento.');
    }
  }

  async function saveUser(values) {
    try {
      if (userDrawer.item) {
        await api.put(`/users/${userDrawer.item.id}`, values);
      } else {
        await api.post('/users', values);
      }

      closeUserDrawer();
      await loadAll();
      ant.modal.success({
        title: 'Concluído',
        content: userDrawer.item
          ? 'As alterações do usuário foram salvas com sucesso.'
          : 'O usuário foi cadastrado com sucesso.',
        centered: true
      });
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao salvar usuário.');
    }
  }

  async function saveBulkDistribution() {
    try {
      await api.post('/distribution/bulk', {
        collectorId: bulkDrawer.collector.id,
        contractIds: selectedContractIds
      });

      closeBulkDrawer();
      await loadAll();
      ant.modal.success({
        title: 'Concluído',
        content: 'A distribuição foi realizada com sucesso.',
        centered: true
      });
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao distribuir contratos.');
    }
  }

  async function submitRenegotiation(values) {
    try {
      await api.post(`/contracts/${renegotiationModal.contract.id}/renegotiate`, {
        installmentCount: values.installmentCount,
        contractStartDate: formatDate(values.contractStartDate),
        interestRate: values.interestRate,
        notes: values.notes || null
      });

      closeRenegotiation();
      await loadAll();
      ant.modal.success({
        title: 'Concluído',
        content: 'A renegociação foi criada com sucesso.',
        centered: true
      });
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao renegociar contrato.');
    }
  }

  async function removeItem(endpoint, successText = 'Registro removido com sucesso.') {
    try {
      await api.delete(endpoint);
      await loadAll();
      ant.modal.success({
        title: 'Concluído',
        content: successText,
        centered: true
      });
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao remover.');
    }
  }

  async function openReceipt(paymentId) {
    try {
      const { data } = await api.get(`/payments/${paymentId}/receipt`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprovante-${paymentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao gerar comprovante PDF.');
    }
  }

  async function loadCashAccounts() {
    try {
      setCashLoading(true);

      const params = {
        month: cashMonth.month() + 1,
        year: cashMonth.year()
      };

      if (cashCollectorId) {
        params.collectorId = cashCollectorId;
      }

      const { data } = await api.get('/cash-accounts/monthly', { params });
      setCashAccounts(data);
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao carregar prestação de contas.');
    } finally {
      setCashLoading(false);
    }
  }

  async function openMonthlyCashReceipt(collectorId) {
    try {
      const { data } = await api.get('/cash-accounts/monthly/receipt', {
        params: { month: cashMonth.month() + 1, year: cashMonth.year(), collectorId },
        responseType: 'text'
      });
      const receiptWindow = window.open('', '_blank');
      if (!receiptWindow) { ant.message.error('Não foi possível abrir a nova aba.'); return; }
      receiptWindow.document.open();
      receiptWindow.document.write(data);
      receiptWindow.document.close();
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao abrir comprovante mensal.');
    }
  }

  async function downloadCashPdf(collectorId, collectorName) {
    try {
      const mes = String(cashMonth.month() + 1).padStart(2, '0');
      const ano = cashMonth.year();
      const { data } = await api.get('/cash-accounts/monthly/receipt/pdf', {
        params: { month: cashMonth.month() + 1, year: ano, collectorId },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `prestacao-${collectorName.replace(/\s+/g, '-')}-${mes}-${ano}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao gerar PDF.');
    }
  }

  async function downloadCashExcel(collectorId, collectorName) {
    try {
      const mes = String(cashMonth.month() + 1).padStart(2, '0');
      const ano = cashMonth.year();
      const { data } = await api.get('/cash-accounts/monthly/receipt/excel', {
        params: { month: cashMonth.month() + 1, year: ano, collectorId },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `prestacao-${collectorName.replace(/\s+/g, '-')}-${mes}-${ano}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao gerar Excel.');
    }
  }

  // CORRIGIDO: download de CSV agora faz fetch com token e usa Blob
  async function downloadCsv(path) {
    try {
      const { data } = await api.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', path.includes('contracts') ? 'relatorio-contratos.csv' : 'relatorio-pagamentos.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao baixar relatório.');
    }
  }





  // ── SPC ───────────────────────────────────────────────────
  async function loadSpcData() {
    try {
      setSpcLoading(true);
      const [recRes, sumRes] = await Promise.all([api.get('/spc'), api.get('/spc/summary')]);
      setSpcRecords(recRes.data || []);
      setSpcSummary(sumRes.data);
    } catch (e) {
      ant.message.error('Erro ao carregar SPC.');
    } finally {
      setSpcLoading(false);
    }
  }

  function openSpcDrawer(item = null) {
    setSpcDrawer({ open: true, item });
    if (item) {
      spcForm.setFieldsValue({ debtAmount: item.debtAmount, reason: item.reason, notes: item.notes });
    } else {
      spcForm.resetFields();
    }
  }

  async function saveSpc(values) {
    try {
      if (spcDrawer.item) {
        await api.put(`/spc/${spcDrawer.item.id}`, values);
      } else {
        await api.post('/spc', {
          ...values,
          includeDate: values.includeDate ? formatDate(values.includeDate) : null,
          contractId: values.contractId || null,
        });
      }
      setSpcDrawer({ open: false, item: null });
      spcForm.resetFields();
      await loadSpcData();
      ant.message.success(spcDrawer.item ? 'Registro atualizado.' : 'Cliente incluido no SPC.', 2);
    } catch (e) {
      ant.message.error(e?.response?.data?.message || 'Erro ao salvar.', 3);
    }
  }

  async function saveBaixar(values) {
    try {
      await api.put(`/spc/${spcBaixarModal.item.id}/baixar`, values);
      setSpcBaixarModal({ open: false, item: null });
      spcBaixarForm.resetFields();
      await Promise.all([loadSpcData(), loadAll()]);
      ant.message.success('Registro baixado com sucesso.', 2);
    } catch (e) {
      ant.message.error(e?.response?.data?.message || 'Erro ao baixar.', 3);
    }
  }

  async function saveAcordo(values) {
    try {
      await api.post(`/spc/${spcAcordoModal.item.id}/acordo`, {
        ...values,
        dueDate: formatDate(values.dueDate),
      });
      setSpcAcordoModal({ open: false, item: null });
      spcAcordoForm.resetFields();
      await loadSpcData();
      ant.message.success('Acordo registrado.', 2);
    } catch (e) {
      ant.message.error(e?.response?.data?.message || 'Erro ao registrar acordo.', 3);
    }
  }

  async function deleteSpc(id) {
    try {
      await api.delete(`/spc/${id}`);
      await loadSpcData();
      ant.message.success('Registro excluido.', 2);
    } catch (e) {
      ant.message.error('Erro ao excluir.', 3);
    }
  }

  function spcStatusColor(status) {
    return status === 'ATIVO' ? 'red' : status === 'ACORDO' ? 'orange' : 'green';
  }

  function diasParaVencer(expireDate) {
    const diff = new Date(expireDate) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // ── Ajuste e edição de movimentações ───────────────────────
  function openAdjust(target = 'stock') {
    setAdjustModal({ open: true, target });
    adjustForm.resetFields();
    adjustForm.setFieldsValue({ type: 'AJUSTE_POSITIVO', quantity: 1 });
  }

  function closeAdjust() {
    setAdjustModal({ open: false, target: 'stock', item: null });
    adjustForm.resetFields();
  }

  function openEditMovement(item, target = 'stock') {
    setEditMovementModal({ open: true, target, item });
    editMovementForm.setFieldsValue({
      quantity: item.quantity,
      unitCost: item.unitCost,
      salePrice: item.salePrice,
      destination: item.destination,
      reason: item.reason,
      notes: item.notes,
    });
  }

  function closeEditMovement() {
    setEditMovementModal({ open: false, target: 'stock', item: null });
    editMovementForm.resetFields();
  }

  async function saveAdjust(values) {
    try {
      const endpoint = adjustModal.target === 'stock'
        ? '/stock/movements/adjust'
        : '/baskets/movements/adjust';
      await api.post(endpoint, {
        ...values,
        quantity: Number(values.quantity),
      });
      closeAdjust();
      if (adjustModal.target === 'stock') {
        const res = await api.get('/products');
        setProducts(res.data || []);
        loadStockSummary();
      } else {
        const res = await api.get('/baskets');
        setBaskets(res.data || []);
        loadBasketSummary();
      }
      ant.message.success('Ajuste registrado.');
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao registrar ajuste.');
    }
  }

  async function saveEditMovement(values) {
    try {
      const { item, target } = editMovementModal;
      const endpoint = target === 'stock'
        ? `/stock/movements/${item.id}`
        : `/baskets/movements/${item.id}`;
      await api.put(endpoint, {
        ...values,
        quantity: Number(values.quantity),
        unitCost: values.unitCost ? Number(values.unitCost) : undefined,
        salePrice: values.salePrice ? Number(values.salePrice) : null,
      });
      closeEditMovement();
      if (target === 'stock') {
        const res = await api.get('/products');
        setProducts(res.data || []);
        loadStockSummary();
      } else {
        const res = await api.get('/baskets');
        setBaskets(res.data || []);
        loadBasketSummary();
      }
      ant.message.success('Movimentação atualizada.');
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao editar movimentação.');
    }
  }

  // ── Cestas Básicas ─────────────────────────────────────────
  function openBasket(item = null) {
    const items = item?.items?.map(i => ({ productId: i.productId, quantity: i.quantity })) || [];
    setBasketItems(items.length ? items : [{ productId: undefined, quantity: 1 }]);
    setBasketDrawer({ open: true, item });
    if (item) {
      basketForm.setFieldsValue({ name: item.name, description: item.description, salePrice: item.salePrice });
    } else {
      basketForm.resetFields();
    }
  }

  function closeBasket() {
    setBasketDrawer({ open: false, item: null });
    setBasketItems([]);
    basketForm.resetFields();
  }

  function openBasketMovement(type = 'MONTAGEM') {
    setBasketMovementModal({ open: true, type });
    basketMovementForm.resetFields();
    basketMovementForm.setFieldsValue({ type, quantity: 1 });
  }

  function closeBasketMovement() {
    setBasketMovementModal({ open: false, type: 'MONTAGEM' });
    basketMovementForm.resetFields();
  }

  async function saveBasket(values) {
    try {
      const payload = { ...values, items: basketItems.filter(i => i.productId) };
      if (payload.items.length === 0) {
        ant.message.error('Adicione pelo menos um produto à cesta.');
        return;
      }
      if (basketDrawer.item) {
        await api.put(`/baskets/${basketDrawer.item.id}`, payload);
      } else {
        await api.post('/baskets', payload);
      }
      closeBasket();
      const res = await api.get('/baskets');
      setBaskets(res.data || []);
      ant.message.success(basketDrawer.item ? 'Cesta atualizada.' : 'Cesta cadastrada.');
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao salvar cesta.');
    }
  }

  async function deleteBasket(id) {
    try {
      await api.delete(`/baskets/${id}`);
      const res = await api.get('/baskets');
      setBaskets(res.data || []);
      ant.message.success('Cesta removida.');
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao remover cesta.');
    }
  }

  async function saveBasketMovement(values) {
    try {
      await api.post('/baskets/movements', {
        ...values,
        quantity: Number(values.quantity),
        salePrice: values.salePrice ? Number(values.salePrice) : null,
      });
      closeBasketMovement();
      const [basketRes] = await Promise.all([api.get('/baskets')]);
      setBaskets(basketRes.data || []);
      // Também atualizar produtos pois a montagem baixa estoque
      const prodRes = await api.get('/products');
      setProducts(prodRes.data || []);
      loadBasketSummary();
      ant.message.success('Movimentação registrada.');
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao registrar movimentação.');
    }
  }

  async function loadBasketSummary() {
    try {
      setBasketLoading(true);
      const res = await api.get('/baskets/summary', {
        params: { month: basketMonth.month() + 1, year: basketMonth.year() }
      });
      setBasketSummary(res.data);
      setBasketMovements(res.data.movimentos || []);
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao carregar resumo.');
    } finally {
      setBasketLoading(false);
    }
  }

  // ── Estoque ────────────────────────────────────────────────
  function openProduct(item = null) {
    setProductDrawer({ open: true, item });
    if (item) {
      productForm.setFieldsValue({
        name: item.name,
        description: item.description,
        unit: item.unit,
        packageUnit: item.packageUnit,
        packageQty: item.packageQty,
        minStock: item.minStock,
        expiryDate: item.expiryDate ? dayjs.utc(item.expiryDate) : null
      });
    } else {
      productForm.resetFields();
      productForm.setFieldsValue({ unit: 'un', minStock: 0 });
    }
  }

  function closeProduct() {
    setProductDrawer({ open: false, item: null });
    productForm.resetFields();
  }

  function openMovement(type = 'ENTRADA') {
    setMovementModal({ open: true, type });
    movementForm.resetFields();
    movementForm.setFieldsValue({ type, unitCost: 0, quantity: 1 });
  }

  function closeMovement() {
    setMovementModal({ open: false, type: 'ENTRADA' });
    movementForm.resetFields();
  }

  async function saveProduct(values) {
    try {
      const payload = {
        ...values,
        expiryDate: values.expiryDate ? formatDate(values.expiryDate) : null
      };
      if (productDrawer.item) {
        await api.put(`/products/${productDrawer.item.id}`, payload);
      } else {
        await api.post('/products', payload);
      }
      closeProduct();
      const res = await api.get('/products');
      setProducts(res.data || []);
      ant.message.success(productDrawer.item ? 'Produto atualizado.' : 'Produto cadastrado.');
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao salvar produto.');
    }
  }

  async function deleteProduct(id) {
    try {
      await api.delete(`/products/${id}`);
      const res = await api.get('/products');
      setProducts(res.data || []);
      ant.message.success('Produto removido.');
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao remover produto.');
    }
  }

  async function saveMovement(values) {
    try {
      await api.post('/stock/movements', {
        ...values,
        quantity: Number(values.quantity),
        unitCost: Number(values.unitCost || 0),
        salePrice: values.salePrice ? Number(values.salePrice) : null,
      });
      closeMovement();
      // Recarregar produtos, cestas e resumo
      const [prodRes, basketRes] = await Promise.all([
        api.get('/products'),
        api.get('/baskets')
      ]);
      setProducts(prodRes.data || []);
      setBaskets(basketRes.data || []);
      loadStockSummary();
      ant.message.success('Movimentação registrada.');
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao registrar movimentação.');
    }
  }

  async function loadStockSummary() {
    try {
      setStockLoading(true);
      const res = await api.get('/stock/summary', {
        params: { month: stockMonth.month() + 1, year: stockMonth.year() }
      });
      setStockSummary(res.data);
      setStockMovements(res.data.movimentos || []);
    } catch (error) {
      ant.message.error(error?.response?.data?.message || 'Erro ao carregar resumo.');
    } finally {
      setStockLoading(false);
    }
  }

  const handleMenuClick = ({ key }) => {
    setCurrent(key);
    if (isMobile) setMobileMenuOpen(false);
  };

  // Carregar resumo automaticamente ao entrar nas abas de estoque/cestas
  useEffect(() => {
    if (current === 'estoque' && isAdmin) loadStockSummary();
    if (current === 'cestas' && isAdmin) loadBasketSummary();
    if (current === 'spc' && isAdmin) loadSpcData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const roleLabel = !user ? '' : user.role === 'ADMIN' ? 'Administrador' : 'Cobrador';

  const sideMenu = (
    <>
      <div className="brand-block" style={{ padding: '20px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MiPixiLogo width={230} height={76} />
      </div>

      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[current]}
        items={menuItems}
        onClick={handleMenuClick}
      />

      {user && (
        <div className="sider-footer">
          <div className="sider-avatar">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div className="sider-user-name">{user?.name}</div>
            <div className="sider-user-role">{roleLabel}</div>
          </div>
        </div>
      )}
    </>
  );

  const loginScreen = (
    <div className="auth-shell">
      <div className="auth-hero" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr 0.85fr', minHeight: '100vh' }}>

        {/* ── Lado esquerdo ── */}
        <div className="auth-left" style={{ padding: isMobile ? '40px 24px' : '64px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="auth-card-glow" />

          <div style={{ marginBottom: 28 }}>
            <MiPixiLogo width={340} height={112} />
          </div>

          <div className="auth-tagline">
            Controle total da sua operação de crédito —<br />
            do contrato à cobrança, do estoque à prestação de contas.
          </div>

          <div className="auth-features">
            {['Contratos e parcelas automáticas', 'Cobrança com distribuição inteligente', 'Estoque e cestas básicas integrados', 'Auditoria completa de todas as ações'].map(f => (
              <div key={f} className="auth-feature-item">
                <span className="auth-feature-dot" />
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* ── Lado direito — card de login ── */}
        <div style={{ padding: isMobile ? '32px 20px' : '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="login-card" style={{ width: '100%', maxWidth: 460 }}>

            <div className="login-card-logo">
              <MiPixiLogo width={220} height={72} />
            </div>

            <div className="login-card-header">
              <div className="login-card-title">Bem-vindo</div>
              <div className="login-card-subtitle">Acesse sua conta para continuar</div>
            </div>

            <Form form={loginForm} layout="vertical" onFinish={onLogin} initialValues={{}}>
              <Form.Item
                label={<span className="login-label">E-mail</span>}
                name="email"
                rules={[{ required: true, message: 'Informe o e-mail.' }]}
              >
                <Input
                  className="login-input"
                  size="large"
                  placeholder="seu@email.com"
                  prefix={<span style={{ color: 'var(--slate-400)', marginRight: 6 }}>✉</span>}
                />
              </Form.Item>

              <Form.Item
                label={<span className="login-label">Senha</span>}
                name="password"
                rules={[{ required: true, message: 'Informe a senha.' }]}
              >
                <Input.Password
                  className="login-input"
                  size="large"
                  placeholder="••••••••"
                  prefix={<span style={{ color: 'var(--slate-400)', marginRight: 6 }}>🔒</span>}
                />
              </Form.Item>

              <Button className="login-btn" type="primary" htmlType="submit" size="large" loading={loading} block>
                Entrar
              </Button>
            </Form>

            <div className="login-card-footer">
              Entre em contato com o administrador para obter suas credenciais de acesso.
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!token || !user) return loginScreen;

  const customerColumns = [
    {
      title: 'Nome',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--slate-800)' }}>{r.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>{r.cpf}</div>
        </div>
      )
    },
    { title: 'Cidade', width: 130, render: (_, r) => `${r.city}/${r.state}` },
    {
      title: 'Status',
      width: 110,
      render: (_, r) => <Tag color={statusColorCustomer(r.status)}>{r.status}</Tag>
    },
    {
      title: 'Ações',
      fixed: isMobile ? false : 'right',
      width: 150,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openCustomerProfile(record)}>Ficha</Button>
          {isAdmin && <Button size="small" onClick={() => openCustomer(record)}>Editar</Button>}
          {isAdmin && (
            <Popconfirm title="Apagar cliente?" onConfirm={() => removeItem(`/customers/${record.id}`, 'O cliente foi excluído com sucesso.')}>
              <Button size="small" danger icon={<span style={{fontSize:11}}>✕</span>} />
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  const contractColumns = [
    {
      title: 'Cliente / Produto',
      width: 200,
      ellipsis: true,
      render: (_, r) => (
        <div style={{ maxWidth: 190 }}>
          <div style={{ fontWeight: 500, color: 'var(--slate-800)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer?.name}</span>
            {spcRecords.some(s => s.customerId === r.customerId && s.status !== 'BAIXADO') && (
              <Tag color="red" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', flexShrink: 0, marginInlineEnd: 0 }}>SPC</Tag>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--slate-400)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product}</div>
        </div>
      )
    },

    {
      title: 'Status',
      width: 110,
      render: (_, r) => <Tag color={statusColorContract(r.status)}>{r.status}</Tag>
    },
    {
      title: 'Parcelas',
      align: 'center',
      width: 130,
      render: (_, r) => (
        <div className="parcelas-cell">
          <div className="parcelas-bar">
            <div className="parcelas-bar-fill" style={{ width: `${r.installmentCount ? (r.paidInstallments / r.installmentCount) * 100 : 0}%` }} />
          </div>
          <div className="parcelas-numbers">
            <span className="paid">{r.paidInstallments}</span>
            <span className="sep">/</span>
            <span className="total">{r.installmentCount}</span>
            {r.overdueInstallments > 0 && <span className="overdue">·{r.overdueInstallments}⚠</span>}
          </div>
        </div>
      )
    },
    { title: 'Financiado', align: 'right', width: 120, render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{money(r.financedAmount)}</span> },
    { title: 'Saldo', align: 'right', width: 120, render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: r.pendingAmount > 0 ? 'var(--red-500)' : 'var(--green-500)', fontWeight: 500 }}>{money(r.pendingAmount)}</span> },
    {
      title: 'Ações',
      fixed: isMobile ? false : 'right',
      width: 160,
      render: (_, record) => (
        <Space size={4}>
          {(
            <Button size="small" type="primary" onClick={() => openPaymentInstallments(record)}>Parcelas</Button>
          )}
          {isAdmin && <Button size="small" onClick={() => openContract(record)}>Editar</Button>}
          {isAdmin && record.pendingAmount > 0 && (
            <Button size="small" icon={<ReloadOutlined />} onClick={() => openRenegotiation(record)} />
          )}
          {isAdmin && (
            <Popconfirm title="Apagar contrato?" onConfirm={() => removeItem(`/contracts/${record.id}`, 'O contrato foi excluído com sucesso.')}>
              <Button size="small" danger icon={<span style={{fontSize:11}}>✕</span>} />
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  const paymentColumns = [
    { title: 'Cliente', render: (_, r) => r.contract?.customer?.name },
    { title: 'Produto', render: (_, r) => r.contract?.product },
    { title: 'Parcela', align: 'center', render: (_, r) => (r.installment ? `${r.installment.number}` : '-') },
    { title: 'Valor', align: 'right', render: (_, r) => money(r.amount) },
    { title: 'Forma', dataIndex: 'paymentMethod' },
    { title: 'Data', render: (_, r) => dateBR(r.paymentDate) },
    { title: 'Recibo', dataIndex: 'receiptCode' },
    {
      title: 'Ações',
      fixed: isMobile ? false : 'right',
      render: (_, record) => (
        <Space wrap>
          <Button icon={<FileTextOutlined />} onClick={() => openReceipt(record.id)}>
            Comprovante
          </Button>
          {<Button onClick={() => openPayment(record)}>Editar</Button>}
          {(
            <Popconfirm
              title="Excluir pagamento?"
              onConfirm={() =>
                removeItem(`/payments/${record.id}`, 'O pagamento foi excluído com sucesso.')
              }
            >
              <Button danger>Excluir</Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  const userColumns = [
    { title: 'Nome', dataIndex: 'name' },
    { title: 'E-mail', dataIndex: 'email' },
    {
      title: 'Perfil',
      render: (_, r) => (
        <Tag color={r.role === 'ADMIN' ? 'blue' : 'purple'}>
          {r.role}
        </Tag>
      )
    },
    {
      title: 'Status',
      render: (_, r) => (
        <Tag color={r.isActive ? 'green' : 'red'}>{r.isActive ? 'ATIVO' : 'INATIVO'}</Tag>
      )
    },
    {
      title: 'Ações',
      fixed: isMobile ? false : 'right',
      render: (_, record) => (
        <Space wrap>
          <Button onClick={() => openUser(record)}>Editar</Button>
          <Popconfirm
            title="Excluir usuário?"
            onConfirm={() =>
              removeItem(`/users/${record.id}`, 'O usuário foi excluído com sucesso.')
            }
          >
            <Button danger>Excluir</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const paymentInstallmentColumns = [
    {
      title: 'Nº',
      align: 'center',
      width: 60,
      render: (_, r) => (
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13 }}>
          {r.number}<span style={{ color: 'var(--slate-300)', fontWeight: 400 }}>/{selectedPaymentContract?.installmentCount || 0}</span>
        </div>
      )
    },
    { title: 'Vencimento', width: 110, render: (_, r) => dateBR(r.dueDate) },
    {
      title: 'Valor total',
      align: 'right',
      width: 120,
      render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)' }}>{money(r.amount)}</span>
    },
    {
      title: 'Progresso',
      width: 180,
      render: (_, r) => {
        const pct = r.amount > 0 ? Math.min((r.paidAmount / r.amount) * 100, 100) : 0;
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: 'var(--slate-500)' }}>
              <span>{money(r.paidAmount)}</span>
              <span>{Math.round(pct)}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--slate-100)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--green-500)' : pct > 0 ? 'var(--blue-500)' : 'transparent', borderRadius: 99, transition: 'width .3s' }} />
            </div>
          </div>
        );
      }
    },
    {
      title: 'Status',
      width: 100,
      render: (_, r) => <Tag color={statusColorInstallment(r.status)}>{r.status}</Tag>
    },
    {
      title: 'Ação',
      width: 140,
      render: (_, r) =>
        r.status !== 'PAGA' ? (
          <Button size="small" type="primary" onClick={() => openPaymentByInstallment(selectedPaymentContract, r)}>
            + Pagamento
          </Button>
        ) : r.status === 'PAGA' ? <Tag color="green">Quitada</Tag> : null
    }
  ];

  const auditColumns = [
    { title: 'Data', render: (_, r) => dateTimeBR(r.createdAt) },
    { title: 'Usuário', render: (_, r) => r.user?.name || '-' },
    { title: 'Ação', dataIndex: 'action' },
    { title: 'Entidade', dataIndex: 'entityType' },
    { title: 'ID', dataIndex: 'entityId' },
    { title: 'Descrição', dataIndex: 'description' }
  ];

  const mobileCustomers = (
    <div>
      {filteredCustomers.map((customer) => (
        <div key={customer.id} className="mobile-row-card">
          <div className="mobile-row-main">
            <div>
              <div className="mobile-row-title">{customer.name}</div>
              <div className="mobile-row-sub" style={{ fontFamily: 'var(--font-mono)' }}>{customer.cpf} · {customer.city}/{customer.state}</div>
            </div>
            <Tag color={statusColorCustomer(customer.status)}>{customer.status}</Tag>
          </div>
          <div className="mobile-row-actions">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openCustomerProfile(customer)}>Ficha</Button>
            {isAdmin && <Button size="small" onClick={() => openCustomer(customer)}>Editar</Button>}
            {isAdmin && (
              <Popconfirm title="Apagar?" onConfirm={() => removeItem(`/customers/${customer.id}`, 'O cliente foi excluído com sucesso.')}>
                <Button size="small" danger>Excluir</Button>
              </Popconfirm>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const mobileContracts = (
    <div>
      {filteredContracts.map((contract) => (
        <div key={contract.id} className="mobile-row-card">
          <div className="mobile-row-main">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mobile-row-title">{contract.customer?.name}</div>
              <div className="mobile-row-sub">{contract.product}</div>
            </div>
            <Tag color={statusColorContract(contract.status)}>{contract.status}</Tag>
          </div>
          <div className="mobile-row-stats">
            <div className="mobile-stat">
              <span className="mobile-stat-label">Financiado</span>
              <span className="mobile-stat-value">{money(contract.financedAmount)}</span>
            </div>
            <div className="mobile-stat">
              <span className="mobile-stat-label">Saldo</span>
              <span className="mobile-stat-value" style={{ color: contract.pendingAmount > 0 ? 'var(--red-500)' : 'var(--green-500)' }}>{money(contract.pendingAmount)}</span>
            </div>
            <div className="mobile-stat">
              <span className="mobile-stat-label">Parcelas</span>
              <span className="mobile-stat-value">{contract.paidInstallments}/{contract.installmentCount}{contract.overdueInstallments > 0 ? ` ⚠${contract.overdueInstallments}` : ''}</span>
            </div>
          </div>
          <div className="mobile-row-actions">
            {<Button size="small" type="primary" onClick={() => openPaymentInstallments(contract)}>Parcelas</Button>}
            {isAdmin && <Button size="small" onClick={() => openContract(contract)}>Editar</Button>}
            {isAdmin && contract.pendingAmount > 0 && <Button size="small" icon={<ReloadOutlined />} onClick={() => openRenegotiation(contract)}>Reneg.</Button>}
            {isAdmin && (
              <Popconfirm title="Apagar?" onConfirm={() => removeItem(`/contracts/${contract.id}`, 'O contrato foi excluído com sucesso.')}>
                <Button size="small" danger>Excluir</Button>
              </Popconfirm>
            )}
          </div>
        </div>
      ))}
    </div>
  );

    const mobilePayments = (
    <div>
      {filteredPayments.map((payment) => (
        <MobileItemCard
          key={payment.id}
          title={`${payment.contract?.customer?.name} - ${payment.contract?.product}`}
          extra={
            <Tag color={Number(payment.contract?.overdueInstallments || 0) > 0 ? 'red' : 'green'}>
              {Number(payment.contract?.overdueInstallments || 0) > 0 ? 'EM ATRASO' : 'EM DIA'}
            </Tag>
          }
        >
          <Typography.Text><strong>Parcela:</strong> {payment.installment ? payment.installment.number : '-'}</Typography.Text><br />
          <Typography.Text><strong>Valor:</strong> {money(payment.amount)}</Typography.Text><br />
          <Typography.Text><strong>Forma:</strong> {payment.paymentMethod}</Typography.Text><br />
          <Typography.Text><strong>Data:</strong> {dateBR(payment.paymentDate)}</Typography.Text><br />
          <Typography.Text><strong>Recibo:</strong> {payment.receiptCode || '-'}</Typography.Text>
          <Divider style={{ margin: '12px 0' }} />
          <Space wrap>
            <Button icon={<FileTextOutlined />} onClick={() => openReceipt(payment.id)}>Comprovante</Button>
            {<Button onClick={() => openPayment(payment)}>Editar</Button>}
            {(
              <Popconfirm
                title="Excluir pagamento?"
                onConfirm={() => removeItem(`/payments/${payment.id}`, 'O pagamento foi excluído com sucesso.')}
              >
                <Button danger>Excluir</Button>
              </Popconfirm>
            )}
          </Space>
        </MobileItemCard>
      ))}
    </div>
  );

  // Dashboard mobile — cards empilhados, touch-friendly
  const mobileDashboard = (
    <div style={{ padding: '0 0 80px' }}>
      {/* Saudação */}
      <div className="dash-mobile-greeting">
        <div className="dash-mobile-date">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="dash-mobile-title">Resumo executivo</div>
      </div>

      {/* KPIs — grade 2x2 */}
      <div className="dash-mobile-kpis">
        <div className="dash-mobile-kpi dash-kpi-blue">
          <div className="dash-mobile-kpi-label">Em aberto</div>
          <div className="dash-mobile-kpi-value">{money(summary.valueOpenMonth)}</div>
          <div className="dash-mobile-kpi-icon">💰</div>
        </div>
        <div className="dash-mobile-kpi dash-kpi-green">
          <div className="dash-mobile-kpi-label">Recebido no mês</div>
          <div className="dash-mobile-kpi-value">{money(summary.valueReceivedMonth)}</div>
          <div className="dash-mobile-kpi-icon">✅</div>
        </div>
        <div className="dash-mobile-kpi dash-kpi-red">
          <div className="dash-mobile-kpi-label">Parcelas atrasadas</div>
          <div className="dash-mobile-kpi-value">{summary.overdueInstallments ?? '—'}</div>
          <div className="dash-mobile-kpi-icon">⚠️</div>
        </div>
        <div className="dash-mobile-kpi dash-kpi-purple">
          <div className="dash-mobile-kpi-label">Cobranças este mês</div>
          <div className="dash-mobile-kpi-value">{summary.cobrancasMes ?? '—'}</div>
          <div className="dash-mobile-kpi-icon">📅</div>
        </div>
      </div>

      {/* Banner faturamento */}
      <div className="dash-mobile-banner">
        <div className="dash-mobile-banner-label">💳 A receber este mês</div>
        <div className="dash-mobile-banner-value">{money(summary.valorCobrancasMes || 0)}</div>
        <div className="dash-mobile-banner-sub">em parcelas com vencimento no mês</div>
      </div>

      {/* Clientes inadimplentes */}
      <div className="dash-mobile-section-title">Inadimplência</div>
      <div className="dash-mobile-inad">
        <div className="dash-mobile-inad-num">{summary.customersInArrears ?? '0'}</div>
        <div className="dash-mobile-inad-label">clientes com parcelas em atraso</div>
      </div>

      {/* Desempenho por cobrador */}
      <div className="dash-mobile-section-title">Desempenho dos cobradores</div>
      {(summary.collectorsPerformance || []).length === 0 ? (
        <div className="dash-mobile-empty">Nenhum pagamento registrado no mês.</div>
      ) : (summary.collectorsPerformance || []).map(r => (
        <div key={r.collectorId} className="dash-mobile-collector-card">
          <div className="dash-mobile-collector-avatar">{r.collectorName?.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dash-mobile-collector-name">{r.collectorName}</div>
            <div className="dash-mobile-collector-sub">{r.paymentsMonth || 0} pagamento{(r.paymentsMonth || 0) !== 1 ? 's' : ''} no mês</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="dash-mobile-collector-month">{money(r.receivedMonth || 0)}</div>
            <div className="dash-mobile-collector-today" style={{ color: r.receivedToday > 0 ? 'var(--blue-500)' : 'var(--slate-300)' }}>
              {r.receivedToday > 0 ? `hoje: ${money(r.receivedToday)}` : 'sem recebimentos hoje'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const defaultDashboard = isMobile ? mobileDashboard : (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <PageHeader
        title="Resumo executivo"
        subtitle="Acompanhe a carteira, a inadimplência e o desempenho da cobrança."
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} className="kpi-card kpi-blue">
            <div className="kpi-icon">💰</div>
            <div className="kpi-label">Em aberto</div>
            <div className="kpi-value">{money(summary.valueOpenMonth)}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} className="kpi-card kpi-green">
            <div className="kpi-icon">✅</div>
            <div className="kpi-label">Recebido no mês</div>
            <div className="kpi-value">{money(summary.valueReceivedMonth)}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} className="kpi-card kpi-red">
            <div className="kpi-icon">⚠️</div>
            <div className="kpi-label">Parcelas atrasadas</div>
            <div className="kpi-value">{summary.overdueInstallments}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card bordered={false} className="kpi-card kpi-gold">
            <div className="kpi-icon">👥</div>
            <div className="kpi-label">Clientes inadimplentes</div>
            <div className="kpi-value">{summary.customersInArrears}</div>
          </Card>
        </Col>
      </Row>

      {/* SPC Cards */}
      {spcSummary && (spcSummary.totalAtivos > 0 || spcSummary.totalAcordos > 0) && (
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)', border: '1px solid #fca5a5', borderRadius: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#dc2626', marginBottom: 4 }}>No SPC</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 800, color: '#dc2626' }}>{spcSummary.totalAtivos}</div>
              <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>clientes ativos</div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ background: 'linear-gradient(135deg,#fff7ed,#ffedd5)', border: '1px solid #fdba74', borderRadius: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#c2410c', marginBottom: 4 }}>A Receber SPC</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, color: '#ea580c' }}>{money(spcSummary.valorTotal)}</div>
              <div style={{ fontSize: 11, color: '#f97316', marginTop: 2 }}>divida total</div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', borderRadius: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#15803d', marginBottom: 4 }}>Baixados/Mes</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{spcSummary.totalBaixadosMes}</div>
              <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>{money(spcSummary.valorBaixadoMes)} recuperado</div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ background: 'linear-gradient(135deg,#faf5ff,#ede9fe)', border: '1px solid #d8b4fe', borderRadius: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#7c3aed', marginBottom: 4 }}>Recuperacao</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 800, color: '#7c3aed' }}>{spcSummary.taxaRecuperacao}%</div>
              <div style={{ fontSize: 11, color: '#8b5cf6', marginTop: 2 }}>taxa do mes</div>
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card bordered={false} title="Desempenho mensal por cobrador">
            <Table
              rowKey="collectorId"
              loading={loading}
              pagination={false}
              dataSource={summary.collectorsPerformance || []}
              scroll={{ x: 600 }}
              locale={{ emptyText: 'Nenhum pagamento registrado no mês.' }}
              columns={[
                { title: 'Cobrador', dataIndex: 'collectorName' },
                { title: 'Total no mês', align: 'right', width: 140, render: (_, r) => (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: r.receivedMonth > 0 ? 'var(--green-500)' : 'var(--slate-300)' }}>
                      {money(r.receivedMonth || 0)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--slate-400)' }}>
                      {r.paymentsMonth || 0} pagamento{(r.paymentsMonth || 0) !== 1 ? 's' : ''}
                    </div>
                  </div>
                )},
                { title: 'Recebido hoje', align: 'right', width: 130, render: (_, r) => (
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: r.receivedToday > 0 ? 'var(--blue-600)' : 'var(--slate-300)' }}>
                    {money(r.receivedToday || 0)}
                  </span>
                )}
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card bordered={false} className="kpi-card kpi-purple" style={{ height: '100%' }}>
            <div className="kpi-icon">📅</div>
            <div className="kpi-label">Cobranças programadas no mês</div>
            <div className="kpi-value">{summary.cobrancasMes ?? '—'}</div>
            <div className="kpi-hint">
              {summary.valorCobrancasMes != null
                ? `${money(summary.valorCobrancasMes)} em parcelas pendentes com vencimento este mês`
                : 'Parcelas com vencimento no mês atual ainda não pagas'}
            </div>
          </Card>
        </Col>
      </Row>
    </Space>
  );

  const dashboard = defaultDashboard;

  const customersView = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="Clientes"
        subtitle="Cadastro principal com acesso rápido à ficha detalhada."
        extra={isAdmin ? <Button type="primary" onClick={() => openCustomer()}>Novo cliente</Button> : null}
      />

      <Card bordered={false}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={14}>
            <Input
              placeholder="Buscar por nome ou CPF"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
          </Col>
          <Col xs={24} md={10}>
            <Select
              value={customerStatusFilter}
              onChange={setCustomerStatusFilter}
              style={{ width: '100%' }}
              placeholder="Filtrar status"
              allowClear
              options={[
                { value: 'ATIVO', label: 'Ativo' },
                { value: 'BLOQUEADO', label: 'Bloqueado' },
                { value: 'INADIMPLENTE', label: 'Inadimplente' }
              ]}
            />
          </Col>
        </Row>
      </Card>

      <Card bordered={false}>
        {isMobile ? mobileCustomers : (
          <ResizableTable
            rowKey="id"
            columns={customerColumns}
            dataSource={filteredCustomers}
            loading={loading}
            scroll={{ x: 700 }}
          />
        )}
      </Card>
    </Space>
  );

  const contractsView = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="Contratos"
        subtitle="Controle completo de parcelas, atrasos, promessas, observações e renegociação."
        extra={
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={() => downloadCsv('/reports/contracts.csv')}>
              Exportar CSV
            </Button>
            {isAdmin && (
              <Button type="primary" onClick={() => openContract()}>Novo contrato</Button>
            )}
          </Space>
        }
      />

      <Card bordered={false}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={14}>
            <Input
              placeholder="Buscar por cliente, CPF ou produto"
              value={contractSearch}
              onChange={(e) => setContractSearch(e.target.value)}
            />
          </Col>
          <Col xs={24} md={10}>
            <Select
              value={contractStatusFilter}
              onChange={setContractStatusFilter}
              style={{ width: '100%' }}
              placeholder="Filtrar status"
              allowClear
              options={[
                { value: 'ATIVO', label: 'Ativo' },
                { value: 'QUITADO', label: 'Quitado' },
                { value: 'ATRASADO', label: 'Atrasado' },
                { value: 'RENEGOCIADO', label: 'Renegociado' }
              ]}
            />
          </Col>
        </Row>
      </Card>

      <Card bordered={false}>
        {isMobile ? mobileContracts : (
          <div className="contracts-table-scroll">
            <ResizableTable
              rowKey="id"
              columns={contractColumns}
              dataSource={filteredContracts}
              loading={loading}
              scroll={{ x: 1200 }}
            />
          </div>
        )}
      </Card>
    </Space>
  );

  const cobrancaView = (() => {
    // Contratos já filtrados pelo endpoint /collector/dashboard
    // Agrupar por cliente
    const clienteMap = new Map();
    contracts.forEach(contract => {
      if (!contract.customer) return;
      const cid = contract.customerId;
      if (!clienteMap.has(cid)) {
        clienteMap.set(cid, { customer: contract.customer, contratos: [] });
      }
      clienteMap.get(cid).contratos.push(contract);
    });
    const meusClientes = Array.from(clienteMap.values());

    return (
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <PageHeader
          title="Minha Cobrança"
          subtitle="Seus clientes e contratos atribuídos."
        />

        {meusClientes.length === 0 ? (
          <Card bordered={false}>
            <Typography.Text type="secondary">
              Nenhum cliente atribuído a você no momento.
            </Typography.Text>
          </Card>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {meusClientes.map(({ customer, contratos: meusContratos }) => {
              const totalPendente = meusContratos.reduce((s, c) => s + Number(c.pendingAmount || 0), 0);
              const totalAtrasadas = meusContratos.reduce((s, c) => s + Number(c.overdueInstallments || 0), 0);

              return (
                <Card
                  key={customer.id}
                  bordered={false}
                  className="cobranca-card"
                  style={{ borderLeft: totalAtrasadas > 0 ? '3px solid var(--red-500)' : '3px solid var(--blue-400)' }}
                >
                  {/* Cabeçalho do cliente */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        background: totalAtrasadas > 0 ? 'var(--red-100)' : 'var(--blue-100)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 15,
                        color: totalAtrasadas > 0 ? 'var(--red-500)' : 'var(--blue-600)',
                        fontFamily: 'var(--font-display)'
                      }}>
                        {customer.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--slate-900)', lineHeight: 1.2 }}>{customer.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>CPF: {customer.cpf}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {totalAtrasadas > 0 && <div style={{ fontSize: 11, color: 'var(--red-500)', fontWeight: 600 }}>⚠ {totalAtrasadas} atrasada{totalAtrasadas > 1 ? 's' : ''}</div>}
                      <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-mono)', color: totalPendente > 0 ? 'var(--red-500)' : 'var(--green-500)' }}>{money(totalPendente)}</div>
                    </div>
                  </div>

                  {/* Contato e endereço */}
                  <div style={{ padding: '8px 0', borderTop: '1px solid var(--slate-100)', borderBottom: '1px solid var(--slate-100)', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <a href={`tel:${customer.phone1}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--blue-600)', background: 'var(--blue-50)', padding: '4px 10px', borderRadius: 99 }}>
                      📞 {customer.phone1}
                    </a>
                    {customer.phone2 && (
                      <a href={`tel:${customer.phone2}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--blue-600)', background: 'var(--blue-50)', padding: '4px 10px', borderRadius: 99 }}>
                        📞 {customer.phone2}
                      </a>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--slate-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      📍 {customer.street}, {customer.number}{customer.complement ? `, ${customer.complement}` : ''} — {customer.neighborhood}, {customer.city}/{customer.state}
                    </span>
                  </div>

                  {/* Contratos e parcelas */}
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {meusContratos.map(contract => {
                      const parcelasPendentes = contract.installments?.filter(i => i.status !== 'PAGA') || [];
                      return (
                        <div key={contract.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--slate-800)' }}>{contract.product}</span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <Tag color={statusColorContract(contract.status)} style={{ margin: 0 }}>{contract.status}</Tag>
                              <span style={{ fontSize: 11.5, color: 'var(--slate-400)' }}>{contract.paidInstallments}/{contract.installmentCount} pagas</span>
                            </div>
                          </div>

                          {parcelasPendentes.length === 0 ? (
                            <Tag color="green">Todas as parcelas quitadas ✓</Tag>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {parcelasPendentes.map(r => (
                                <div key={r.id} style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: r.status === 'ATRASADA' ? 'var(--red-100)' : 'var(--slate-50)',
                                  border: `1px solid ${r.status === 'ATRASADA' ? 'var(--red-100)' : 'var(--slate-200)'}`,
                                  borderRadius: 8,
                                  padding: '10px 12px',
                                  gap: 8
                                }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--slate-700)' }}>
                                        Parcela {r.number}
                                      </span>
                                      <Tag color={statusColorInstallment(r.status)} style={{ margin: 0 }}>{r.status}</Tag>
                                    </div>
                                    <div style={{ fontSize: 12, color: r.status === 'ATRASADA' ? 'var(--red-500)' : 'var(--slate-500)', marginTop: 3 }}>
                                      Venc: {dateBR(r.dueDate)} · {money(r.amount)}
                                      {r.paidAmount > 0 && <span style={{ color: 'var(--green-500)' }}> · Pago: {money(r.paidAmount)}</span>}
                                    </div>
                                  </div>
                                  <Button
                                    type="primary"
                                    size="small"
                                    style={{ flexShrink: 0, fontWeight: 600 }}
                                    onClick={() => openPaymentByInstallment(contract, r)}
                                  >
                                    Receber
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Space>
                </Card>
              );
            })}
          </Space>
        )}
      </Space>
    );
  })();


  // ── Tela de Estoque ──────────────────────────────────────────
  const estoqueView = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="Estoque"
        subtitle="Controle de produtos, entradas, saídas e avarias."
        extra={
          <Space wrap>
            <Button className="stock-btn-entrada" onClick={() => openMovement('ENTRADA')}>↑ Entrada</Button>
            <Button className="stock-btn-saida" onClick={() => openMovement('SAIDA')}>↓ Saída</Button>
            <Button className="stock-btn-avaria" onClick={() => openMovement('AVARIA')}>⚠ Avaria</Button>
            <Button className="stock-btn-troca" onClick={() => openMovement('TROCA')}>↺ Troca</Button>
            <Button onClick={() => setHistoryModal({ open: true, target: 'stock' })} style={{ borderColor: 'var(--slate-500)', color: 'var(--slate-600)' }}>📋 Histórico</Button>
            <Button onClick={() => openAdjust('stock')} style={{ borderColor: 'var(--purple-500)', color: 'var(--purple-500)' }}>⚖ Ajuste</Button>
            <Button type="primary" icon={<span style={{marginRight:4}}>+</span>} onClick={() => openProduct()}>Produto</Button>
          </Space>
        }
      />

      {/* KPIs sempre visíveis — mês atual em tempo real */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card bordered={false} className="stock-kpi-card stock-kpi-estoque">
            <div className="stock-kpi-icon">📦</div>
            <div className="stock-kpi-label">Valor em estoque</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 }}>Custo</div>
                <div className="stock-kpi-value" style={{ fontSize: 18 }}>{stockSummary ? money(stockSummary.valorEstoque) : <span className="stock-kpi-loading">—</span>}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--purple-500)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 }}>Venda</div>
                <div className="stock-kpi-value" style={{ fontSize: 18, color: 'var(--purple-500)' }}>{stockSummary ? money(stockSummary.valorEstoqueVenda) : <span className="stock-kpi-loading">—</span>}</div>
              </div>
            </div>
            <div className="stock-kpi-sub" style={{ color: 'var(--green-500)', marginTop: 4 }}>
              {stockSummary ? `💹 +${money(stockSummary.valorEstoqueVenda - stockSummary.valorEstoque)} lucro potencial` : `${products.length} produto${products.length !== 1 ? 's' : ''}`}
            </div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} className="stock-kpi-card stock-kpi-entrada">
            <div className="stock-kpi-icon">↑</div>
            <div className="stock-kpi-label">Entradas no mês</div>
            <div className="stock-kpi-value">{stockSummary ? money(stockSummary.totalEntradaValor) : <span className="stock-kpi-loading">—</span>}</div>
            <div className="stock-kpi-sub">{stockSummary ? `${stockSummary.totalEntradas} movimentações` : stockLoading ? 'Carregando...' : '—'}</div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} className="stock-kpi-card stock-kpi-saida">
            <div className="stock-kpi-icon">↓</div>
            <div className="stock-kpi-label">Saídas no mês</div>
            <div className="stock-kpi-value">{stockSummary ? money(stockSummary.totalSaidaValor) : <span className="stock-kpi-loading">—</span>}</div>
            <div className="stock-kpi-sub">{stockSummary ? `${stockSummary.totalSaidas} movimentações` : stockLoading ? 'Carregando...' : '—'}</div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} className="stock-kpi-card stock-kpi-avaria">
            <div className="stock-kpi-icon">⚠</div>
            <div className="stock-kpi-label">Avarias no mês</div>
            <div className="stock-kpi-value">{stockSummary ? money(stockSummary.totalAvariaValor) : <span className="stock-kpi-loading">—</span>}</div>
            <div className="stock-kpi-sub">{stockSummary ? `${stockSummary.totalAvarias} ocorrência${stockSummary.totalAvarias !== 1 ? 's' : ''}` : stockLoading ? 'Carregando...' : '—'}</div>
          </Card>
        </Col>
      </Row>

      {/* Alertas */}
      {stockSummary && (stockSummary.estoqueBaixo?.length > 0 || stockSummary.validadeProxima?.length > 0) && (
        <Row gutter={[12, 12]}>
          {stockSummary.estoqueBaixo?.length > 0 && (
            <Col xs={24} md={12}>
              <div className="stock-alert stock-alert-warning">
                <div className="stock-alert-title">⚠ Estoque abaixo do mínimo</div>
                {stockSummary.estoqueBaixo.map(p => (
                  <div key={p.id} className="stock-alert-item">
                    <span>{p.name}</span>
                    <span><strong>{p.currentStock} {p.unit}</strong> <span style={{color:'var(--slate-400)'}}>/ mín {p.minStock}</span></span>
                  </div>
                ))}
              </div>
            </Col>
          )}
          {stockSummary.validadeProxima?.length > 0 && (
            <Col xs={24} md={12}>
              <div className="stock-alert stock-alert-danger">
                <div className="stock-alert-title">📅 Validade próxima (30 dias)</div>
                {stockSummary.validadeProxima.map(p => (
                  <div key={p.id} className="stock-alert-item">
                    <span>{p.name}</span>
                    <strong>{dateBR(p.expiryDate)}</strong>
                  </div>
                ))}
              </div>
            </Col>
          )}
        </Row>
      )}

      {/* Resumo histórico — meses anteriores */}
      <Card bordered={false} title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>Histórico mensal</span>
          <DatePicker
            picker="month"
            size="small"
            value={stockMonth}
            onChange={v => setStockMonth(v || dayjs())}
            format="MM/YYYY"
            style={{ width: 120 }}
          />
          <Button size="small" type="primary" onClick={loadStockSummary} loading={stockLoading}>
            Gerar
          </Button>
          {stockSummary && (
            <span style={{ fontSize: 11, color: 'var(--slate-400)' }}>
              {stockSummary.month}/{stockSummary.year} — {stockSummary.movimentos?.length || 0} movimentações
            </span>
          )}
        </div>
      }>
        {stockSummary && stockMovements.length > 0 ? (
          isMobile ? (
            <div>
              {stockMovements.map(r => {
                const cfg = { ENTRADA: { color: 'green', icon: '↑', bg: '#f0fdf4' }, SAIDA: { color: 'blue', icon: '↓', bg: '#eff6ff' }, AVARIA: { color: 'orange', icon: '⚠', bg: '#fff7ed' }, TROCA: { color: 'purple', icon: '↺', bg: '#faf5ff' }, AJUSTE_POSITIVO: { color: 'cyan', icon: '+', bg: '#ecfeff' }, AJUSTE_NEGATIVO: { color: 'volcano', icon: '-', bg: '#fff1f0' } };
                const c = cfg[r.type] || { color: 'default', icon: '•', bg: '#f8fafc' };
                return (
                  <div key={r.id} className="mov-card" style={{ background: c.bg }}>
                    <div className="mov-card-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color={c.color} style={{ margin: 0, fontSize: 11, fontWeight: 700 }}>{c.icon} {r.type}</Tag>
                        <span className="mov-card-product">{r.product?.name || r.basket?.name}</span>
                      </div>
                      <span className="mov-card-date">{dateBR(r.createdAt)}</span>
                    </div>
                    <div className="mov-card-values">
                      <div className="mov-card-val-block">
                        <div className="mov-card-val-label">Qtd</div>
                        <div className="mov-card-val-num">{r.quantity} <span style={{fontSize:10}}>{r.product?.unit||''}</span></div>
                      </div>
                      <div className="mov-card-val-block">
                        <div className="mov-card-val-label">Custo total</div>
                        <div className="mov-card-val-num">{money(r.quantity * r.unitCost)}</div>
                        <div className="mov-card-val-sub">{money(r.unitCost)}/un</div>
                      </div>
                      {r.salePrice ? (
                        <div className="mov-card-val-block">
                          <div className="mov-card-val-label">Venda total</div>
                          <div className="mov-card-val-num" style={{color:'var(--blue-600)'}}>{money(r.quantity * r.salePrice)}</div>
                          <div className="mov-card-val-sub">{money(r.salePrice)}/un</div>
                        </div>
                      ) : null}
                      {r.margin != null ? (
                        <div className="mov-card-val-block">
                          <div className="mov-card-val-label">Margem</div>
                          <div className="mov-card-val-num" style={{color: r.margin >= 30 ? 'var(--green-500)' : r.margin >= 0 ? 'var(--amber-500)' : 'var(--red-500)'}}>{r.margin}%</div>
                        </div>
                      ) : null}
                    </div>
                    {(r.destination || r.reason || r.customer?.name) && (
                      <div className="mov-card-dest">{r.destination || r.reason || r.customer?.name}</div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <Button size="small" onClick={() => openEditMovement(r, 'stock')}>Editar</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
          <Table
            rowKey="id"
            size="small"
            dataSource={stockMovements}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 800 }}
            columns={[
              { title: 'Data', width: 105, render: (_, r) => dateBR(r.createdAt) },
              { title: 'Tipo', width: 90, render: (_, r) => {
                const cfg = { ENTRADA: { color: 'green', icon: '↑' }, SAIDA: { color: 'blue', icon: '↓' }, AVARIA: { color: 'orange', icon: '⚠' }, TROCA: { color: 'purple', icon: '↺' } };
                const c = cfg[r.type] || { color: 'default', icon: '' };
                return <Tag color={c.color}>{c.icon} {r.type}</Tag>;
              }},
              { title: 'Produto', render: (_, r) => r.product?.name },
              { title: 'Qtd', align: 'center', width: 65, render: (_, r) => <span style={{fontFamily:'var(--font-mono)'}}>{r.quantity} {r.product?.unit || ''}</span> },
              { title: 'Custo', align: 'right', width: 110, render: (_, r) => (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12 }}>{money(r.quantity * r.unitCost)}</div>
                  <div style={{ fontSize: 10, color: 'var(--slate-400)' }}>{money(r.unitCost)}/un</div>
                </div>
              )},
              { title: 'Venda', align: 'right', width: 110, render: (_, r) => r.salePrice ? (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: 'var(--blue-600)' }}>{money(r.quantity * r.salePrice)}</div>
                  <div style={{ fontSize: 10, color: 'var(--slate-400)' }}>{money(r.salePrice)}/un</div>
                </div>
              ) : <span style={{color:'var(--slate-300)'}}>—</span> },
              { title: 'Margem', align: 'center', width: 75, render: (_, r) => r.margin != null ? <Tag color={r.margin >= 30 ? 'green' : r.margin >= 0 ? 'gold' : 'red'}>{r.margin}%</Tag> : <span style={{color:'var(--slate-300)'}}>—</span> },
              { title: 'Destino / Motivo', render: (_, r) => <span style={{fontSize:12}}>{r.destination || r.reason || r.customer?.name || '—'}</span> },
                { title: '', width: 70, render: (_, r) => (
                  <Button size="small" onClick={() => openEditMovement(r, 'stock')}>Editar</Button>
                )},
            ]}
          />
          )
        ) : (
          <Typography.Text type="secondary">
            {stockLoading ? 'Carregando...' : 'Selecione o mês e clique em Gerar para ver o histórico.'}
          </Typography.Text>
        )}
      </Card>

      {/* Produtos cadastrados */}
      <Card bordered={false} title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Produtos cadastrados</span>
          <Space size={8} wrap>
            <Select
              allowClear
              placeholder="Filtrar por unidade..."
              size="small"
              style={{ width: 160 }}
              value={unitFilter || undefined}
              onChange={v => setUnitFilter(v || '')}
              options={[...new Set(products.map(p => p.unit))].map(u => ({ value: u, label: u }))}
            />
            <span style={{ fontSize: 12, color: 'var(--slate-400)' }}>
              Valor em estoque: <strong style={{ color: 'var(--slate-800)' }}>{money(products.filter(p => !unitFilter || p.unit === unitFilter).reduce((s, p) => s + p.currentStock * p.costPrice, 0))}</strong>
            </span>
          </Space>
        </div>
      }>
        {isMobile ? (
          <div>
            {products.filter(p => !unitFilter || p.unit === unitFilter).map(p => (
              <div key={p.id} className="prod-card">
                <div className="prod-card-top">
                  <div>
                    <div className="prod-card-name">{p.name}</div>
                    {p.description && <div className="prod-card-desc">{p.description}</div>}
                  </div>
                  <div className="prod-card-unit">
                    {p.unit}
                    {p.packageUnit && <div style={{fontSize:10,color:'var(--slate-400)'}}>{p.packageQty}x/{p.packageUnit}</div>}
                  </div>
                </div>
                <div className="prod-card-stats">
                  <div className="prod-card-stat">
                    <div className="prod-card-stat-label">Estoque</div>
                    <div className="prod-card-stat-value" style={{color: p.currentStock === 0 ? 'var(--slate-300)' : p.currentStock <= p.minStock && p.minStock > 0 ? 'var(--red-500)' : 'var(--green-500)'}}>{p.currentStock}</div>
                  </div>
                  <div className="prod-card-stat">
                    <div className="prod-card-stat-label">Mín.</div>
                    <div className="prod-card-stat-value" style={{color:'var(--slate-400)'}}>{p.minStock}</div>
                  </div>
                  <div className="prod-card-stat">
                    <div className="prod-card-stat-label">Custo</div>
                    <div className="prod-card-stat-value">{money(p.costPrice)}</div>
                  </div>
                  <div className="prod-card-stat">
                    <div className="prod-card-stat-label">Venda</div>
                    <div className="prod-card-stat-value" style={{color:'var(--blue-600)'}}>{money(p.salePrice)}</div>
                  </div>
                  <div className="prod-card-stat">
                    <div className="prod-card-stat-label">Total</div>
                    <div className="prod-card-stat-value" style={{fontWeight:700}}>{money(p.currentStock * p.costPrice)}</div>
                  </div>
                </div>
                <div className="prod-card-actions">
                  <Button size="small" onClick={() => openProduct(p)}>Editar</Button>
                  <Popconfirm title="Remover produto?" onConfirm={() => deleteProduct(p.id)}>
                    <Button size="small" danger icon={<span style={{fontSize:10}}>✕</span>} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        ) : (
        <Table
          rowKey="id"
          dataSource={products.filter(p => !unitFilter || p.unit === unitFilter)}
          loading={loading}
          scroll={{ x: 900 }}
          columns={[
            { title: 'Produto', render: (_, r) => (
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div>
                {r.description && <div style={{ fontSize: 11.5, color: 'var(--slate-400)' }}>{r.description}</div>}
              </div>
            )},
            { title: 'Un.', width: 55, align: 'center', render: (_, r) => (
              <div style={{ textAlign: 'center' }}>
                <div>{r.unit}</div>
                {r.packageUnit && <div style={{ fontSize: 10, color: 'var(--slate-400)' }}>{r.packageQty}x/{r.packageUnit}</div>}
              </div>
            )},
            { title: 'Estoque', width: 80, align: 'center', render: (_, r) => (
              <span style={{
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: r.currentStock <= r.minStock && r.minStock > 0 ? 'var(--red-500)' : r.currentStock === 0 ? 'var(--slate-300)' : 'var(--green-500)'
              }}>
                {r.currentStock}
              </span>
            )},
            { title: 'Mín.', width: 60, align: 'center', render: (_, r) => <span style={{fontSize:12,color:'var(--slate-400)'}}>{r.minStock}</span> },
            { title: 'Custo', align: 'right', width: 100, render: (_, r) => <span style={{fontFamily:'var(--font-mono)',fontSize:12}}>{money(r.costPrice)}</span> },
            { title: 'Venda', align: 'right', width: 100, render: (_, r) => <span style={{fontFamily:'var(--font-mono)',fontSize:12}}>{money(r.salePrice)}</span> },
            { title: 'Margem', align: 'center', width: 80, render: (_, r) => {
              if (!r.salePrice || !r.costPrice) return <span style={{color:'var(--slate-300)'}}>—</span>;
              const m = Math.round(((r.salePrice - r.costPrice) / r.salePrice) * 100);
              return <Tag color={m >= 30 ? 'green' : m >= 10 ? 'gold' : 'red'}>{m}%</Tag>;
            }},
            { title: 'Validade', width: 100, render: (_, r) => {
              if (!r.expiryDate) return <span style={{color:'var(--slate-300)'}}>—</span>;
              const days = Math.ceil((new Date(r.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
              return <span style={{color: days <= 30 ? 'var(--red-500)' : 'var(--slate-700)', fontSize:12}}>{dateBR(r.expiryDate)}</span>;
            }},
            { title: 'Valor total', align: 'right', width: 110, render: (_, r) => <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:600}}>{money(r.currentStock * r.costPrice)}</span> },
            {
              title: '', fixed: 'right', width: 110,
              render: (_, record) => (
                <Space size={4}>
                  <Button size="small" onClick={() => openProduct(record)}>Editar</Button>
                  <Popconfirm title="Remover produto?" onConfirm={() => deleteProduct(record.id)}>
                    <Button size="small" danger icon={<span style={{fontSize:10}}>✕</span>} />
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
        )}
      </Card>
    </Space>
  );

    const assignmentsView = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="Distribuição"
        subtitle="Atribua contratos em aberto a cobradores. O cobrador acompanha o cliente até quitar todas as parcelas."
      />

      {distributionCollectors.length === 0 ? (
        <Card bordered={false}>
          <Typography.Text type="secondary">
            Nenhum cobrador ativo encontrado. Cadastre cobradores na aba Usuários.
          </Typography.Text>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {distributionCollectors.map((collector) => (
            <Col xs={24} md={12} xl={8} key={collector.id}>
              <Card
                bordered={false}
                className="collector-card"
                title={collector.name}
                extra={
                  <Button type="primary" onClick={() => openBulkDistribution(collector)}>
                    Nova distribuição
                  </Button>
                }
              >
                <Typography.Paragraph style={{ marginBottom: 8 }}>
                  <strong>E-mail:</strong> {collector.email}
                </Typography.Paragraph>

                <Typography.Paragraph style={{ marginBottom: 12 }}>
                  <strong>Clientes atribuídos:</strong> {collector.assignedCount}
                </Typography.Paragraph>

                {collector.assignedCustomers.length === 0 ? (
                  <Typography.Text type="secondary">Nenhum cliente atribuído.</Typography.Text>
                ) : (
                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    {collector.assignedCustomers.map((c) => (
                      <Card key={c.assignmentId} size="small">
                        <Space
                          style={{ width: '100%', justifyContent: 'space-between' }}
                          align="center"
                          wrap
                        >
                          <Typography.Text>
                            {c.customerName} - {c.product}
                          </Typography.Text>

                          <Popconfirm
                            title="Remover distribuição?"
                            onConfirm={() =>
                              removeItem(
                                `/assignments/${c.assignmentId}`,
                                'A distribuição foi removida com sucesso.'
                              )
                            }
                          >
                            <Button size="small" danger>
                              Remover
                            </Button>
                          </Popconfirm>
                        </Space>
                      </Card>
                    ))}
                  </Space>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Space>
  );


    const paymentsView = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="Pagamentos"
        subtitle="Registre recebimentos, emita comprovantes e acompanhe parcelas."
        extra={
          <Button icon={<FileExcelOutlined />} onClick={() => downloadCsv('/reports/payments.csv')}>
            Exportar CSV
          </Button>
        }
      />

      <Card bordered={false}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Input
              placeholder="Buscar por cliente, CPF ou produto"
              value={paymentSearch}
              onChange={(e) => setPaymentSearch(e.target.value)}
            />
          </Col>
          <Col xs={24} md={12}>
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={paymentDateRange}
              onChange={setPaymentDateRange}
            />
          </Col>
        </Row>
      </Card>

      <Card bordered={false} title="Clientes / contratos">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredContracts}
          pagination={{ pageSize: 8 }}
          scroll={{ x: 1100 }}
          columns={[
            { title: 'Cliente', render: (_, r) => r.customer?.name },
            { title: 'Produto', dataIndex: 'product' },
            {
              title: 'Situação',
              render: (_, r) => (
                <Tag color={Number(r.overdueInstallments || 0) > 0 ? 'red' : 'green'}>
                  {Number(r.overdueInstallments || 0) > 0 ? 'EM ATRASO' : 'EM DIA'}
                </Tag>
              )
            },
            { title: 'Pagas', align: 'center', dataIndex: 'paidInstallments' },
            { title: 'Restantes', align: 'center', dataIndex: 'remainingInstallments' },
            { title: 'Saldo', align: 'right', render: (_, r) => money(r.pendingAmount) },
            {
              title: 'Ações',
              render: (_, record) => (
                <Button type="primary" onClick={() => openPaymentInstallments(record)}>
                  Ver parcelas
                </Button>
              )
            }
          ]}
        />
      </Card>

      <Card bordered={false} title="Histórico de pagamentos">
        {isMobile ? mobilePayments : (
          <ResizableTable
            rowKey="id"
            columns={paymentColumns}
            dataSource={filteredPayments}
            loading={loading}
            scroll={{ x: 1200 }}
          />
        )}
      </Card>
    </Space>
  );


    const cashAccountsView = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="Prestação de contas mensal"
        subtitle="Resumo mensal dos recebimentos por cobrador."
        extra={
          <Button type="primary" onClick={loadCashAccounts}>
            Gerar relatório
          </Button>
        }
      />

      <Card bordered={false}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <DatePicker
              picker="month"
              style={{ width: '100%' }}
              value={cashMonth}
              onChange={(value) => setCashMonth(value || dayjs())}
              format="MM/YYYY"
            />
          </Col>
          <Col xs={24} md={12}>
            <Select
              allowClear
              value={cashCollectorId}
              onChange={setCashCollectorId}
              style={{ width: '100%' }}
              placeholder="Filtrar por cobrador"
              options={collectors.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Col>
        </Row>
      </Card>

      {cashAccounts.map((account) => (
        <Card
          key={account.collectorId}
          bordered={false}
          title={`${account.collectorName} - ${String(account.month).padStart(2, '0')}/${account.year}`}
          extra={
            <Space>
              <Button icon={<FileExcelOutlined />} onClick={() => downloadCashExcel(account.collectorId, account.collectorName)}>
                Excel
              </Button>
              <Button icon={<FilePdfOutlined />} danger onClick={() => downloadCashPdf(account.collectorId, account.collectorName)}>
                PDF
              </Button>
            </Space>
          }
        >
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={6}>
              <Statistic title="Recebimentos" value={account.receiptsCount} />
            </Col>
            <Col xs={24} md={6}>
              <Statistic title="Total PIX" value={account.totalPix} formatter={(v) => money(v)} />
            </Col>
            <Col xs={24} md={6}>
              <Statistic title="Total Dinheiro" value={account.totalCash} formatter={(v) => money(v)} />
            </Col>
            <Col xs={24} md={6}>
              <Statistic title="Total Geral" value={account.totalReceived} formatter={(v) => money(v)} />
            </Col>
          </Row>

          <Table
            rowKey="id"
            loading={cashLoading}
            dataSource={account.items}
            pagination={false}
            scroll={{ x: 1000 }}
            columns={[
              { title: 'Data', render: (_, r) => dateBR(r.date) },
              { title: 'Cliente', dataIndex: 'client' },
              { title: 'Contrato', dataIndex: 'contract' },
              { title: 'Parcela', align: 'center', render: (_, r) => r.installmentNumber || '-' },
              { title: 'Forma', dataIndex: 'paymentMethod' },
              { title: 'Cobrador', dataIndex: 'collector' },
              { title: 'Valor', align: 'right', render: (_, r) => money(r.amount) }
            ]}
          />
        </Card>
      ))}
    </Space>
  );


    const usersView = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="Usuários"
        subtitle="Gerencie administradores, cobradores e vendedores."
        extra={<Button type="primary" onClick={() => openUser()}>Novo usuário</Button>}
      />

      <Card bordered={false}>
        <Table
          rowKey="id"
          columns={userColumns}
          dataSource={users}
          loading={loading}
          scroll={{ x: 900 }}
        />
      </Card>
    </Space>
  );


    const auditView = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="Auditoria"
        subtitle="Histórico das ações realizadas no sistema."
      />

      <Card bordered={false}>
        <Table
          rowKey="id"
          columns={auditColumns}
          dataSource={auditLogs}
          loading={loading}
          scroll={{ x: 1200 }}
        />
      </Card>
    </Space>
  );


  // ── Tela de Cestas Básicas ────────────────────────────────────
  const cestasView = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="Cestas Básicas"
        subtitle="Monte, venda e controle o estoque de cestas."
        extra={
          <Space wrap>
            <Button className="stock-btn-entrada" onClick={() => openBasketMovement('MONTAGEM')}>🔨 Montar</Button>
            <Button className="stock-btn-troca" onClick={() => openBasketMovement('DESMONTAGEM')}>↩ Desmontar</Button>
            <Button onClick={() => setHistoryModal({ open: true, target: 'basket' })} style={{ borderColor: 'var(--slate-500)', color: 'var(--slate-600)' }}>📋 Histórico</Button>
            <Button onClick={() => openAdjust('basket')} style={{ borderColor: 'var(--purple-500)', color: 'var(--purple-500)' }}>⚖ Ajuste</Button>
            <Button type="primary" onClick={() => openBasket()}>+ Nova cesta</Button>
          </Space>
        }
      />

      {/* KPIs em tempo real */}
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card bordered={false} className="stock-kpi-card stock-kpi-estoque">
            <div className="stock-kpi-icon">🧺</div>
            <div className="stock-kpi-label">Estoque (custo)</div>
            <div className="stock-kpi-value">{basketSummary ? money(basketSummary.valorEstoque) : <span className="stock-kpi-loading">—</span>}</div>
            <div className="stock-kpi-sub">{baskets.length} tipo{baskets.length !== 1 ? 's' : ''} de cesta</div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} className="stock-kpi-card stock-kpi-purple">
            <div className="stock-kpi-icon">💹</div>
            <div className="stock-kpi-label">Estoque (venda)</div>
            <div className="stock-kpi-value">{basketSummary ? money(basketSummary.valorEstoqueVenda) : <span className="stock-kpi-loading">—</span>}</div>
            <div className="stock-kpi-sub" style={{ color: basketSummary && basketSummary.valorEstoqueVenda > basketSummary.valorEstoque ? 'var(--green-500)' : 'var(--slate-400)' }}>
              {basketSummary ? `+${money(basketSummary.valorEstoqueVenda - basketSummary.valorEstoque)} lucro potencial` : '—'}
            </div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} className="stock-kpi-card stock-kpi-entrada">
            <div className="stock-kpi-icon">🔨</div>
            <div className="stock-kpi-label">Montadas no mês</div>
            <div className="stock-kpi-value">{basketSummary ? basketSummary.totalMontadas : <span className="stock-kpi-loading">—</span>}</div>
            <div className="stock-kpi-sub">{basketSummary ? `custo ${money(basketSummary.totalCustoValor)}` : basketLoading ? 'Carregando...' : '—'}</div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} className="stock-kpi-card stock-kpi-saida">
            <div className="stock-kpi-icon">💰</div>
            <div className="stock-kpi-label">Vendidas no mês</div>
            <div className="stock-kpi-value">{basketSummary ? basketSummary.totalVendidas : <span className="stock-kpi-loading">—</span>}</div>
            <div className="stock-kpi-sub">{basketSummary ? money(basketSummary.totalVendaValor) : basketLoading ? 'Carregando...' : '—'}</div>
          </Card>
        </Col>
      </Row>

      {/* Histórico mensal */}
      <Card bordered={false} title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>Histórico mensal</span>
          <DatePicker picker="month" size="small" value={basketMonth} onChange={v => setBasketMonth(v || dayjs())} format="MM/YYYY" style={{ width: 120 }} />
          <Button size="small" type="primary" onClick={loadBasketSummary} loading={basketLoading}>Gerar</Button>
          {basketSummary && <span style={{ fontSize: 11, color: 'var(--slate-400)' }}>{basketMovements.length} movimentações</span>}
        </div>
      }>
        {basketSummary && basketMovements.length > 0 ? (
          <Table
            rowKey="id"
            size="small"
            dataSource={basketMovements}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 700 }}
            columns={[
              { title: 'Data', width: 105, render: (_, r) => dateBR(r.createdAt) },
              { title: 'Tipo', width: 110, render: (_, r) => {
                const cfg = { MONTAGEM: { color: 'green', icon: '🔨' }, VENDA: { color: 'blue', icon: '💰' }, AVARIA: { color: 'orange', icon: '⚠' }, DESMONTAGEM: { color: 'purple', icon: '↩' } };
                const c = cfg[r.type] || { color: 'default', icon: '' };
                return <Tag color={c.color}>{c.icon} {r.type}</Tag>;
              }},
              { title: 'Cesta', render: (_, r) => r.basket?.name },
              { title: 'Qtd', align: 'center', width: 60, render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.quantity}</span> },
              { title: 'Custo', align: 'right', width: 110, render: (_, r) => (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12 }}>{money(r.quantity * r.unitCost)}</div>
                  <div style={{ fontSize: 10, color: 'var(--slate-400)' }}>{money(r.unitCost)}/un</div>
                </div>
              )},
              { title: 'Venda', align: 'right', width: 110, render: (_, r) => r.salePrice ? (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: 'var(--blue-600)' }}>{money(r.quantity * r.salePrice)}</div>
                  <div style={{ fontSize: 10, color: 'var(--slate-400)' }}>{money(r.salePrice)}/un</div>
                </div>
              ) : <span style={{ color: 'var(--slate-300)' }}>—</span> },
              { title: 'Margem', align: 'center', width: 80, render: (_, r) => r.margin != null ? <Tag color={r.margin >= 30 ? 'green' : r.margin >= 0 ? 'gold' : 'red'}>{r.margin}%</Tag> : <span style={{ color: 'var(--slate-300)' }}>—</span> },
              { title: 'Destino', render: (_, r) => <span style={{ fontSize: 12 }}>{r.destination || r.customer?.name || r.reason || '—'}</span> },
              { title: 'Usuário', width: 100, render: (_, r) => <span style={{ fontSize: 12 }}>{r.user?.name || '—'}</span> },
              { title: '', width: 70, render: (_, r) => (
                <Button size="small" onClick={() => openEditMovement(r, 'basket')}>Editar</Button>
              )},
            ]}
          />
        ) : (
          <Typography.Text type="secondary">{basketLoading ? 'Carregando...' : 'Selecione o mês e clique em Gerar.'}</Typography.Text>
        )}
      </Card>

      {/* Cestas cadastradas */}
      <Card bordered={false} title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Cestas cadastradas</span>
          <span style={{ fontSize: 12, color: 'var(--slate-400)', fontWeight: 400 }}>
            Valor em estoque: <strong style={{ color: 'var(--slate-800)' }}>{money(baskets.reduce((s, b) => s + b.currentStock * b.costPrice, 0))}</strong>
          </span>
        </div>
      }>
        <Table
          rowKey="id"
          dataSource={baskets}
          loading={loading}
          scroll={{ x: 900 }}
          expandable={{
            expandedRowRender: basket => (
              <div style={{ padding: '6px 0' }}>
                <div style={{ fontSize: 11, color: 'var(--slate-400)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Composição</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {basket.items?.map(item => (
                    <div key={item.id} style={{ background: 'var(--slate-50)', border: '1px solid var(--slate-200)', borderRadius: 6, padding: '3px 10px', fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>{item.quantity} {item.product?.unit}</span>
                      <span style={{ color: 'var(--slate-500)', marginLeft: 4 }}>{item.product?.name}</span>
                      <span style={{ color: 'var(--slate-300)', marginLeft: 4 }}>· {money(item.product?.costPrice * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
            rowExpandable: basket => basket.items?.length > 0,
          }}
          columns={[
            { title: 'Cesta', render: (_, r) => (
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div>
                {r.description && <div style={{ fontSize: 11.5, color: 'var(--slate-400)' }}>{r.description}</div>}
              </div>
            )},
            { title: 'Estoque', width: 80, align: 'center', render: (_, r) => (
              <span style={{
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: r.currentStock === 0 ? 'var(--slate-300)' : 'var(--green-500)'
              }}>
                {r.currentStock}
              </span>
            )},
            { title: 'Custo', align: 'right', width: 110, render: (_, r) => (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{money(r.costPrice)}</span>
            )},
            { title: 'Venda', align: 'right', width: 110, render: (_, r) => (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue-600)', fontWeight: 600 }}>{money(r.salePrice)}</span>
            )},
            { title: 'Margem', align: 'center', width: 85, render: (_, r) => (
              <Tag color={r.margin >= 30 ? 'green' : r.margin >= 10 ? 'gold' : 'red'}>{r.margin}%</Tag>
            )},
            { title: 'Valor total', align: 'right', width: 110, render: (_, r) => (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{money(r.currentStock * r.costPrice)}</span>
            )},
            {
              title: '', fixed: 'right', width: 110,
              render: (_, record) => (
                <Space size={4}>
                  <Button size="small" onClick={() => openBasket(record)}>Editar</Button>
                  <Popconfirm title="Remover cesta?" onConfirm={() => deleteBasket(record.id)}>
                    <Button size="small" danger icon={<span style={{ fontSize: 10 }}>✕</span>} />
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>
    </Space>
  );


  // ── Tela SPC ─────────────────────────────────────────────────
  const spcView = (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageHeader
        title="SPC — Inadimplentes"
        subtitle="Gerencie os clientes incluidos no SPC, acordos e baixas."
        extra={
          <Button type="primary" danger onClick={() => openSpcDrawer()}>+ Incluir no SPC</Button>
        }
      />

      {/* KPIs */}
      {spcSummary && (
        <Row gutter={[16, 16]}>
          <Col xs={12} lg={6}>
            <Card bordered={false} className="stock-kpi-card stock-kpi-avaria">
              <div className="stock-kpi-icon">🚫</div>
              <div className="stock-kpi-label">Ativos no SPC</div>
              <div className="stock-kpi-value" style={{ color: 'var(--red-500)' }}>{spcSummary.totalAtivos}</div>
              <div className="stock-kpi-sub">{spcSummary.totalAcordos} em acordo</div>
            </Card>
          </Col>
          <Col xs={12} lg={6}>
            <Card bordered={false} className="stock-kpi-card stock-kpi-saida">
              <div className="stock-kpi-icon">💸</div>
              <div className="stock-kpi-label">Valor total da dívida</div>
              <div className="stock-kpi-value">{money(spcSummary.valorTotal)}</div>
              <div className="stock-kpi-sub">a receber do SPC</div>
            </Card>
          </Col>
          <Col xs={12} lg={6}>
            <Card bordered={false} className="stock-kpi-card stock-kpi-entrada">
              <div className="stock-kpi-icon">✅</div>
              <div className="stock-kpi-label">Baixados no mês</div>
              <div className="stock-kpi-value">{spcSummary.totalBaixadosMes}</div>
              <div className="stock-kpi-sub">{money(spcSummary.valorBaixadoMes)} recuperado</div>
            </Card>
          </Col>
          <Col xs={12} lg={6}>
            <Card bordered={false} className="stock-kpi-card stock-kpi-purple">
              <div className="stock-kpi-icon">📈</div>
              <div className="stock-kpi-label">Taxa de recuperação</div>
              <div className="stock-kpi-value">{spcSummary.taxaRecuperacao}%</div>
              <div className="stock-kpi-sub">
                {spcSummary.vencendo > 0
                  ? <span style={{ color: 'var(--red-500)' }}>⚠ {spcSummary.vencendo} vencendo em 30 dias</span>
                  : 'nenhum vencendo'}
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* Tabela de registros */}
      <Card bordered={false} title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>Registros no SPC</span>
          <Tag color="red">{spcRecords.filter(r => r.status === 'ATIVO').length} ativos</Tag>
          <Tag color="orange">{spcRecords.filter(r => r.status === 'ACORDO').length} em acordo</Tag>
          <Tag color="green">{spcRecords.filter(r => r.status === 'BAIXADO').length} baixados</Tag>
        </div>
      }>
        <Table
          rowKey="id"
          loading={spcLoading}
          dataSource={spcRecords}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 900 }}
          rowClassName={r => {
            if (r.status !== 'BAIXADO' && diasParaVencer(r.expireDate) <= 30) return 'spc-row-alert';
            return '';
          }}
          columns={[
            { title: 'Cliente', render: (_, r) => (
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.customer?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>{r.customer?.cpf}</div>
              </div>
            )},
            { title: 'Status', width: 110, render: (_, r) => (
              <Tag color={spcStatusColor(r.status)} style={{ fontWeight: 600 }}>{r.status}</Tag>
            )},
            { title: 'Dívida atual', align: 'right', width: 130, render: (_, r) => (
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: r.status === 'BAIXADO' ? 'var(--slate-400)' : 'var(--red-500)' }}>
                {money(r.debtAmount)}
              </span>
            )},
            { title: 'Incluído em', width: 110, render: (_, r) => dateBR(r.includeDate) },
            { title: 'Vence em', width: 110, render: (_, r) => {
              const dias = diasParaVencer(r.expireDate);
              return (
                <div>
                  <div style={{ fontSize: 12 }}>{dateBR(r.expireDate)}</div>
                  {r.status !== 'BAIXADO' && dias <= 30 && (
                    <div style={{ fontSize: 10, color: 'var(--red-500)', fontWeight: 600 }}>⚠ {dias} dias</div>
                  )}
                </div>
              );
            }},
            { title: 'Motivo', render: (_, r) => <span style={{ fontSize: 12 }}>{r.reason || '—'}</span> },
            { title: 'Ações', width: 200, render: (_, r) => (
              <Space size={4} wrap>
                {r.status !== 'BAIXADO' && (
                  <>
                    <Button size="small" onClick={() => { setSpcBaixarModal({ open: true, item: r }); spcBaixarForm.resetFields(); }}>
                      ✅ Baixar
                    </Button>
                    <Button size="small" style={{ borderColor: 'var(--amber-500)', color: 'var(--amber-500)' }}
                      onClick={() => { setSpcAcordoModal({ open: true, item: r }); spcAcordoForm.resetFields(); }}>
                      🤝 Acordo
                    </Button>
                  </>
                )}
                <Button size="small" onClick={() => openSpcDrawer(r)}>Editar</Button>
                <Popconfirm title="Excluir registro?" onConfirm={() => deleteSpc(r.id)}>
                  <Button size="small" danger icon={<span style={{ fontSize: 10 }}>✕</span>} />
                </Popconfirm>
              </Space>
            )},
          ]}
          expandable={{
            expandedRowRender: r => (
              <div style={{ padding: '8px 0' }}>
                {r.agreements?.length > 0 && (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: 'var(--slate-600)' }}>ACORDOS</div>
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={r.agreements}
                      columns={[
                        { title: 'Valor acordado', render: (_, a) => money(a.agreedAmount) },
                        { title: 'Parcelas', dataIndex: 'installments', align: 'center' },
                        { title: 'Vencimento', render: (_, a) => dateBR(a.dueDate) },
                        { title: 'Status', render: (_, a) => <Tag color={a.status === 'PAGO' ? 'green' : a.status === 'QUEBRADO' ? 'red' : 'orange'}>{a.status}</Tag> },
                        { title: 'Obs', render: (_, a) => <span style={{ fontSize: 11 }}>{a.notes || '—'}</span> },
                      ]}
                    />
                  </>
                )}
                {r.notes && <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 8 }}>📝 {r.notes}</div>}
                {r.removedReason && <div style={{ fontSize: 12, color: 'var(--green-600)', marginTop: 4 }}>✅ Baixado: {r.removedReason}</div>}
              </div>
            ),
            rowExpandable: r => r.agreements?.length > 0 || !!r.notes || !!r.removedReason,
          }}
        />
      </Card>
    </Space>
  );

  // CORRIGIDO: contentMap agora é construído de forma explícita, sem spreads condicionais
  // que causavam render vazio na tela de distribuição


  
  const contentMap = {
    dashboard: isCollector ? null : dashboard,
    customers: !isCollector ? customersView : null,
    contracts: isCollector ? null : contractsView,
    cobranca: isCollector ? cobrancaView : null,
    sales: null,
    payments: (!isCollector) ? paymentsView : null,
    assignments: isAdmin ? assignmentsView : null,
    users: isAdmin ? usersView : null,
    cashAccounts: isAdmin ? cashAccountsView : null,
    estoque: isAdmin ? estoqueView : null,
    cestas: isAdmin ? cestasView : null,
    spc: isAdmin ? spcView : null,
    audit: isAdmin ? auditView : null
  };

  return (
    <>
      {/* Header fixo fora do Layout Ant */}
      <div className="main-header" style={{
        position: 'fixed',
        top: 0,
        left: isMobile ? 0 : 260,
        right: 0,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingInline: isMobile ? 16 : 28,
        zIndex: 200
      }}>
        <Space size={12} align="center">
          {isMobile && (
            <Button icon={<MenuOutlined />} onClick={() => setMobileMenuOpen(true)} />
          )}
          <div>
            <div style={{ fontSize: isMobile ? 17 : 19, fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-.4px', color: 'var(--slate-900)', lineHeight: 1.2 }}>
              {menuItems.find(m => m.key === current)?.label || 'MiPixi Pro'}
            </div>
            {!isMobile && (
              <div style={{ fontSize: 12, color: 'var(--slate-400)', fontFamily: 'var(--font-body)', marginTop: 2 }}>
                Olá, {user?.name} · {roleLabel}
              </div>
            )}
          </div>
        </Space>
        <Button className="btn-logout" icon={<LogoutOutlined />} onClick={logout}>
          {isMobile ? '' : 'Sair'}
        </Button>
      </div>

      <Layout style={{ minHeight: '100vh' }}>
        {!isMobile && (
          <Sider width={260} className="main-sider" style={{ position: 'fixed', left: 0, top: 0, height: '100vh', zIndex: 300 }}>
            {sideMenu}
          </Sider>
        )}

        {isMobile && (
          <Drawer
            open={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            placement="left"
            width={280}
            styles={{
              body: { padding: 0, background: '#04101f' },
              header: { display: 'none' },
              wrapper: { background: '#04101f' }
            }}
            style={{ background: '#04101f' }}
            className="mobile-drawer-menu"
          >
            <div style={{ background: '#04101f', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
              {sideMenu}
            </div>
          </Drawer>
        )}

        <Layout style={{ marginLeft: isMobile ? 0 : 260 }}>
          <Content
            className="main-content"
            style={{
              paddingTop: 64 + (isMobile ? 16 : 24),
              paddingBottom: isMobile ? 16 : 24,
              paddingInline: isMobile ? 16 : 24,
              minHeight: '100vh'
            }}
          >
            <div className="page-shell">
              {contentMap[current]}
            </div>
          </Content>
        </Layout>
      </Layout>

      <Drawer
        open={customerDrawer.open}
        title={customerDrawer.item ? 'Editar cliente' : 'Novo cliente'}
        width={drawerWidth}
        onClose={closeCustomerDrawer}
        destroyOnClose
      >
        <Form layout="vertical" form={customerForm} onFinish={saveCustomer} initialValues={initialCustomer}>
          <Divider orientation="left">Dados principais</Divider>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name="cpf" label="CPF" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="name" label="Nome" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="birthDate" label="Data de nascimento" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} md={6}>
              <Form.Item shouldUpdate noStyle>
                {() => (
                  <Form.Item label="Idade">
                    <Input value={ageFromDate(customerForm.getFieldValue('birthDate'))} disabled />
                  </Form.Item>
                )}
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'ATIVO', label: 'Ativo' },
                    { value: 'BLOQUEADO', label: 'Bloqueado' },
                    { value: 'INADIMPLENTE', label: 'Inadimplente' }
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Contato</Divider>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name="phone1" label="Telefone 1" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="phone2" label="Telefone 2"><Input /></Form.Item></Col>
          </Row>

          <Divider orientation="left">Endereço</Divider>
          <Row gutter={16}>
            <Col xs={24} md={8}><Form.Item name="zipCode" label="CEP"><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="street" label="Rua" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={4}><Form.Item name="number" label="Número" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="complement" label="Complemento"><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="neighborhood" label="Bairro" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="city" label="Cidade" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={4}><Form.Item name="state" label="UF" rules={[{ required: true }]}><Input maxLength={2} /></Form.Item></Col>
          </Row>

          <Divider orientation="left">Financeiro</Divider>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name="monthlyIncome" label="Renda mensal" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="residenceMonths" label="Tempo no endereço (meses)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>

          <Form.Item name="notes" label="Observações internas">
            <Input.TextArea rows={4} />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>Salvar cliente</Button>
        </Form>
      </Drawer>

      <Drawer
        open={contractDrawer.open}
        title={contractDrawer.item ? 'Editar contrato' : 'Novo contrato'}
        width={contractDrawerWidth}
        onClose={closeContractDrawer}
        destroyOnClose
      >
        <Form layout="vertical" form={contractForm} onFinish={saveContract} initialValues={initialContract}>
          <Divider orientation="left">Contrato</Divider>
          <Form.Item name="customerId" label="Cliente" rules={[{ required: true }]}>
            <Select
              options={customers.map((c) => ({ value: c.id, label: `${c.name} - ${c.cpf}` }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="product" label="Produto" rules={[{ required: true, message: 'Selecione o produto.' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Selecionar produto do estoque..."
                  onChange={(val) => {
                    const prod = products.find(p => p.name === val);
                    const basket = baskets.find(b => b.name === val);
                    setSelectedContractProduct(prod ? { ...prod, isBasket: false } : basket ? { ...basket, isBasket: true } : null);
                    if (prod) contractForm.setFieldsValue({ financedAmount: prod.salePrice });
                    if (basket) contractForm.setFieldsValue({ financedAmount: basket.salePrice });
                  }}
                  options={[
                    {
                      label: '🧺 Cestas Básicas',
                      options: baskets.map(b => ({
                        value: b.name,
                        label: `${b.name} — estoque: ${b.currentStock} · R$ ${b.salePrice.toFixed(2)}`
                      }))
                    },
                    {
                      label: '📦 Produtos',
                      options: products.map(p => ({
                        value: p.name,
                        label: `${p.name} (${p.unit}) — estoque: ${p.currentStock} · R$ ${p.salePrice.toFixed(2)}`
                      }))
                    }
                  ]}
                />
              </Form.Item>
              {selectedContractProduct && (
                <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: -10, marginBottom: 8, padding: '6px 10px', background: 'var(--slate-50)', borderRadius: 6 }}>
                  {selectedContractProduct.isBasket ? '🧺 Cesta' : '📦 Produto'} ·
                  Estoque: <strong>{selectedContractProduct.currentStock} {selectedContractProduct.unit}</strong>
                  {selectedContractProduct.packageUnit && <span> · <strong>{selectedContractProduct.packageQty} {selectedContractProduct.unit}/{selectedContractProduct.packageUnit}</strong></span>} ·
                  Venda: <strong>{money(selectedContractProduct.salePrice)}/{selectedContractProduct.unit}</strong>
                </div>
              )}
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Quantidade" required style={{ marginBottom: 0 }}>
                <Input.Group compact>
                  <Form.Item name="quantity" noStyle rules={[{ required: true, message: 'Informe a quantidade.' }]}>
                    <InputNumber
                      style={{ width: 'calc(100% - 130px)' }}
                      min={1}
                      step={1}
                      onChange={(val) => {
                        const prod = selectedContractProduct;
                        if (!prod) return;
                        const isPackage = contractUnitType === 'package';
                        const unitQty = isPackage ? (prod.packageQty || 1) * (val || 1) : (val || 1);
                        contractForm.setFieldsValue({ financedAmount: Number((prod.salePrice * unitQty).toFixed(2)) });
                      }}
                    />
                  </Form.Item>
                  <Select
                    style={{ width: 130 }}
                    value={contractUnitType}
                    onChange={(v) => {
                      setContractUnitType(v);
                      const prod = selectedContractProduct;
                      if (!prod) return;
                      const qty = contractForm.getFieldValue('quantity') || 1;
                      const unitQty = v === 'package' ? (prod.packageQty || 1) * qty : qty;
                      contractForm.setFieldsValue({ financedAmount: Number((prod.salePrice * unitQty).toFixed(2)) });
                    }}
                    options={[
                      { value: 'unit', label: selectedContractProduct?.unit || 'un' },
                      ...(selectedContractProduct?.packageUnit ? [{
                        value: 'package',
                        label: selectedContractProduct.packageUnit
                      }] : [])
                    ]}
                  />
                </Input.Group>
                {contractUnitType === 'package' && selectedContractProduct?.packageQty && (
                  <div style={{ fontSize: 11, color: 'var(--blue-500)', marginTop: 4 }}>
                    = {(contractForm.getFieldValue('quantity') || 1) * selectedContractProduct.packageQty} {selectedContractProduct.unit} no total
                  </div>
                )}
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'ATIVO', label: 'Ativo' },
                    { value: 'QUITADO', label: 'Quitado' },
                    { value: 'ATRASADO', label: 'Atrasado' },
                    { value: 'RENEGOCIADO', label: 'Renegociado' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}><Form.Item name="financedAmount" label="Valor financiado" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="installmentCount" label="Parcelas" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="contractStartDate" label="Início do contrato" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="interestRate" label="Juros (%)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>

          <Divider orientation="left">Cobrança</Divider>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name="promisedPaymentDate" label="Promessa de pagamento"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="promisedPaymentValue" label="Valor prometido"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>

          <Form.Item name="collectionNote" label="Anotação de cobrança">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item name="notes" label="Observações do contrato">
            <Input.TextArea rows={4} />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>Salvar contrato</Button>
        </Form>
      </Drawer>

      <Modal
        open={paymentModal.open}
        title={paymentModal.item ? 'Editar pagamento' : 'Novo pagamento'}
        onCancel={closePaymentModal}
        footer={null}
        width={paymentModalWidth}
        centered
        zIndex={2200}
        maskClosable={false}
        style={{ top: isMobile ? 10 : 20 }}
      >
        <Form layout="vertical" form={paymentForm} onFinish={savePayment}>
          <Form.Item name="contractId" hidden><Input /></Form.Item>
          <Form.Item name="installmentId" hidden><Input /></Form.Item>
          {isCollector && <Form.Item name="collectorId" hidden><Input /></Form.Item>}

          {selectedInstallment && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Typography.Text><strong>Cliente:</strong> {selectedInstallment.contract.customer.name}</Typography.Text><br />
              <Typography.Text><strong>Produto:</strong> {selectedInstallment.contract.product}</Typography.Text><br />
              <Typography.Text><strong>Parcela:</strong> {selectedInstallment.installment.number}</Typography.Text><br />
              <Typography.Text><strong>Vencimento:</strong> {dateBR(selectedInstallment.installment.dueDate)}</Typography.Text><br />
              <Typography.Text><strong>Saldo da parcela:</strong> {money(Number(selectedInstallment.installment.amount || 0) - Number(selectedInstallment.installment.paidAmount || 0))}</Typography.Text>
            </Card>
          )}

          <Form.Item
            name="collectorId"
            label="Cobrador que recebeu"
            rules={[{ required: true, message: 'Informe o cobrador.' }]}
          >
            <Select
              disabled={isCollector}
              options={
                isCollector
                  ? [{ value: user?.id, label: user?.name }]
                  : collectors.map((c) => ({ value: c.id, label: c.name }))
              }
            />
          </Form.Item>

          <Form.Item
            name="paymentMethod"
            label="Forma de recebimento"
            rules={[{ required: true, message: 'Informe a forma de recebimento.' }]}
          >
            <Select
              options={[
                { value: 'PIX', label: 'PIX' },
                { value: 'DINHEIRO', label: 'Dinheiro' }
              ]}
            />
          </Form.Item>

          <Form.Item name="amount" label="Valor recebido" rules={[{ required: true, message: 'Informe o valor.' }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} />
          </Form.Item>

          <Form.Item name="paymentDate" label="Data do pagamento" rules={[{ required: true, message: 'Informe a data.' }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item name="notes" label="Observações">
            <Input.TextArea rows={4} />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>Salvar pagamento</Button>
        </Form>
      </Modal>

      <Drawer
        open={userDrawer.open}
        title={userDrawer.item ? 'Editar usuário' : 'Novo usuário'}
        width={userDrawerWidth}
        onClose={closeUserDrawer}
        destroyOnClose
      >
        <Form layout="vertical" form={userForm} onFinish={saveUser} initialValues={initialUser}>
          <Form.Item name="name" label="Nome" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="E-mail" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="role" label="Perfil" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'ADMIN', label: 'Administrador' },
                { value: 'COLLECTOR', label: 'Cobrador' },              ]}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={userDrawer.item ? 'Nova senha (opcional)' : 'Senha'}
            rules={userDrawer.item ? [] : [{ required: true }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="isActive" label="Status" rules={[{ required: true }]}>
            <Select
              options={[
                { value: true, label: 'Ativo' },
                { value: false, label: 'Inativo' }
              ]}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Salvar usuário</Button>
        </Form>
      </Drawer>

      <Drawer
        open={bulkDrawer.open}
        title={bulkDrawer.collector ? `Nova distribuição - ${bulkDrawer.collector.name}` : 'Nova distribuição'}
        width={bulkDrawerWidth}
        onClose={closeBulkDrawer}
        destroyOnClose
      >
        <Typography.Paragraph>
          Selecione os contratos em aberto que deseja atribuir a este cobrador.
        </Typography.Paragraph>

        {availableContracts.length === 0 ? (
          <Typography.Text type="secondary">
            Nenhum contrato em aberto disponível para distribuição no momento.
          </Typography.Text>
        ) : (
          <Table
            rowKey="id"
            dataSource={availableContracts}
            pagination={{ pageSize: 8 }}
            rowSelection={{
              selectedRowKeys: selectedContractIds,
              onChange: (keys) => setSelectedContractIds(keys)
            }}
            scroll={{ x: 1000 }}
            columns={[
              { title: 'Cliente', render: (_, r) => (
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.customer.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--slate-400)' }}>{r.customer.cpf}</div>
                </div>
              )},
              { title: 'Produto', dataIndex: 'product' },
              { title: 'Status', width: 100, render: (_, r) => <Tag color={statusColorContract(r.status)}>{r.status}</Tag> },
              { title: 'Parcelas', align: 'center', width: 90, render: (_, r) => `${r.paidInstallments || 0}/${r.installmentCount}` },
              { title: 'Atrasadas', align: 'center', width: 90, render: (_, r) => r.overdueInstallments > 0 ? <Tag color="red">{r.overdueInstallments}</Tag> : <span style={{ color: 'var(--slate-300)' }}>—</span> },
              { title: 'Saldo', align: 'right', width: 110, render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red-500)', fontWeight: 500 }}>{money(r.pendingAmount)}</span> }
            ]}
          />
        )}

        <Divider />

        <Button
          type="primary"
          block
          disabled={!selectedContractIds.length}
          onClick={saveBulkDistribution}
        >
          Distribuir contratos selecionados
        </Button>
      </Drawer>

      <Modal
        open={paymentInstallmentsModal.open}
        title={
          selectedPaymentContract
            ? `Parcelas - ${selectedPaymentContract.customer?.name} - ${selectedPaymentContract.product}`
            : 'Parcelas'
        }
        onCancel={closePaymentInstallmentsModal}
        footer={null}
        width={installmentsModalWidth}
        destroyOnClose
        centered
        zIndex={2000}
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={selectedPaymentContract?.installments || []}
          columns={paymentInstallmentColumns}
          pagination={false}
          scroll={{ x: 1000, y: isMobile ? 420 : 520 }}
        />
      </Modal>

      <Modal
        open={customerProfileModal.open}
        onCancel={closeCustomerProfile}
        footer={null}
        width={profileModalWidth}
        centered
        destroyOnClose
        title="Ficha completa do cliente"
      >
        {customerProfileModal.loading ? (
          <Typography.Text>Carregando ficha...</Typography.Text>
        ) : customerProfileModal.data ? (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Card bordered={false}>
              <Descriptions
                bordered
                size="small"
                column={isMobile ? 1 : 2}
                items={[
                  { key: '1', label: 'Nome', children: customerProfileModal.data.customer.name },
                  { key: '2', label: 'CPF', children: customerProfileModal.data.customer.cpf },
                  { key: '3', label: 'Status', children: <Tag color={statusColorCustomer(customerProfileModal.data.customer.status)}>{customerProfileModal.data.customer.status}</Tag> },
                  { key: '4', label: 'Nascimento', children: dateBR(customerProfileModal.data.customer.birthDate) },
                  { key: '5', label: 'Idade', children: `${ageFromDate(customerProfileModal.data.customer.birthDate)} anos` },
                  { key: '6', label: 'Telefone 1', children: customerProfileModal.data.customer.phone1 },
                  { key: '7', label: 'Telefone 2', children: customerProfileModal.data.customer.phone2 || '-' },
                  { key: '8', label: 'Cidade', children: `${customerProfileModal.data.customer.city}/${customerProfileModal.data.customer.state}` },
                  { key: '9', label: 'Endereço', children: `${customerProfileModal.data.customer.street}, ${customerProfileModal.data.customer.number}` },
                  { key: '10', label: 'Bairro', children: customerProfileModal.data.customer.neighborhood },
                  { key: '11', label: 'CEP', children: customerProfileModal.data.customer.zipCode || '-' },
                  { key: '12', label: 'Complemento', children: customerProfileModal.data.customer.complement || '-' },
                  { key: '13', label: 'Renda', children: money(customerProfileModal.data.customer.monthlyIncome) },
                  { key: '14', label: 'Tempo no endereço', children: `${customerProfileModal.data.customer.residenceMonths} meses` },
                  { key: '15', label: 'Criado por', children: customerProfileModal.data.customer.createdBy?.name || '-' },
                  { key: '16', label: 'Observações', children: customerProfileModal.data.customer.notes || '-' }
                ]}
              />
            </Card>

            {/* Para cobrador: mostra contratos atribuídos com parcelas abertas */}
            {isCollector ? (
              <Card bordered={false} title="Contratos atribuídos">
                {customerProfileModal.data.customer.contracts
                  .filter(c => c.assignments?.some(a => a.collector?.id === user?.id || a.collectorId === user?.id))
                  .length === 0 ? (
                  <Typography.Text type="secondary">Nenhum contrato atribuído a você para este cliente.</Typography.Text>
                ) : (
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    {customerProfileModal.data.customer.contracts
                      .filter(c => c.assignments?.some(a => a.collector?.id === user?.id || a.collectorId === user?.id))
                      .map(contract => (
                        <Card key={contract.id} size="small" style={{ borderColor: contract.overdueInstallments > 0 ? 'var(--red-100)' : 'var(--slate-200)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--slate-900)' }}>{contract.product}</div>
                              <div style={{ fontSize: 12, color: 'var(--slate-400)', marginTop: 2 }}>
                                {contract.installmentCount} parcelas · Saldo: <span style={{ color: contract.pendingAmount > 0 ? 'var(--red-500)' : 'var(--green-500)', fontWeight: 600 }}>{money(contract.pendingAmount)}</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <Tag color={statusColorContract(contract.status)}>{contract.status}</Tag>
                              {contract.overdueInstallments > 0 && <Tag color="red">⚠ {contract.overdueInstallments} atrasada{contract.overdueInstallments > 1 ? 's' : ''}</Tag>}
                            </div>
                          </div>
                          <Table
                            rowKey="id"
                            size="small"
                            pagination={false}
                            dataSource={contract.installments?.filter(i => i.status !== 'PAGA') || []}
                            locale={{ emptyText: <Tag color="green">Todas as parcelas quitadas ✓</Tag> }}
                            columns={[
                              {
                                title: 'Nº',
                                width: 50,
                                align: 'center',
                                render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.number}</span>
                              },
                              { title: 'Vencimento', width: 110, render: (_, r) => dateBR(r.dueDate) },
                              { title: 'Valor', align: 'right', width: 110, render: (_, r) => money(r.amount) },
                              { title: 'Pago', align: 'right', width: 110, render: (_, r) => money(r.paidAmount) },
                              {
                                title: 'Status',
                                width: 100,
                                render: (_, r) => <Tag color={statusColorInstallment(r.status)}>{r.status}</Tag>
                              },
                              {
                                title: '',
                                width: 130,
                                render: (_, r) => (
                                  <Button
                                    size="small"
                                    type="primary"
                                    onClick={() => {
                                      openPaymentByInstallment(contract, r);
                                    }}
                                  >
                                    + Receber
                                  </Button>
                                )
                              }
                            ]}
                          />
                        </Card>
                      ))}
                  </Space>
                )}
              </Card>
            ) : (
              <Card bordered={false} title="Contratos vinculados">
                <Table
                  rowKey="id"
                  dataSource={customerProfileModal.data.customer.contracts}
                  pagination={false}
                  scroll={{ x: 1000 }}
                  columns={[
                    { title: 'Produto', dataIndex: 'product' },
                    { title: 'Vendedor', render: (_, r) => r.seller?.name || '-' },
                    { title: 'Status', render: (_, r) => <Tag color={statusColorContract(r.status)}>{r.status}</Tag> },
                    { title: 'Saldo', align: 'right', render: (_, r) => money(r.pendingAmount) },
                    { title: 'Parcelas', align: 'center', render: (_, r) => `${r.paidInstallments}/${r.installmentCount}` },
                    { title: 'Atrasadas', align: 'center', dataIndex: 'overdueInstallments' }
                  ]}
                />
              </Card>
            )}

            {!isCollector && (
            <Card bordered={false} title="Linha do tempo">
              <Timeline
                items={(customerProfileModal.data.timeline || []).map((item) => ({
                  children: (
                    <div>
                      <Typography.Text strong>{item.title}</Typography.Text>
                      <br />
                      <Typography.Text type="secondary">{dateTimeBR(item.date)}</Typography.Text>
                      <br />
                      <Typography.Text>{item.description}</Typography.Text>
                    </div>
                  )
                }))}
              />
            </Card>
            )}
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={renegotiationModal.open}
        onCancel={closeRenegotiation}
        footer={null}
        width={renegotiationModalWidth}
        centered
        destroyOnClose
        title="Renegociar contrato"
      >
        {renegotiationModal.contract && (
          <Form
            layout="vertical"
            form={renegotiationForm}
            onFinish={submitRenegotiation}
            initialValues={initialRenegotiation}
          >
            <Card size="small" style={{ marginBottom: 16 }}>
              <Typography.Text><strong>Cliente:</strong> {renegotiationModal.contract.customer?.name}</Typography.Text><br />
              <Typography.Text><strong>Produto:</strong> {renegotiationModal.contract.product}</Typography.Text><br />
              <Typography.Text><strong>Saldo atual:</strong> {money(renegotiationModal.contract.pendingAmount)}</Typography.Text>
            </Card>

            <Form.Item
              name="installmentCount"
              label="Nova quantidade de parcelas"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>

            <Form.Item
              name="contractStartDate"
              label="Nova data de início"
              rules={[{ required: true }]}
            >
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>

            <Form.Item
              name="interestRate"
              label="Novo juros (%)"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>

            <Form.Item name="notes" label="Observações">
              <Input.TextArea rows={4} />
            </Form.Item>

            <Button type="primary" htmlType="submit" block>
              Confirmar renegociação
            </Button>
          </Form>
        )}
      </Modal>

      {/* ── Modal de produto ─────────────────────────────────── */}
      <Drawer
        open={productDrawer.open}
        onClose={closeProduct}
        title={productDrawer.item ? 'Editar produto' : 'Novo produto'}
        width={isMobile ? '100%' : 520}
        footer={
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={closeProduct}>Cancelar</Button>
            <Button type="primary" onClick={() => productForm.submit()}>Salvar</Button>
          </Space>
        }
      >
        <Form layout="vertical" form={productForm} onFinish={saveProduct}>
          <Form.Item name="name" label="Nome do produto" rules={[{ required: true, message: 'Informe o nome.' }]}>
            <Input placeholder="Ex: Cesta Básica, Smart TV 50'..." />
          </Form.Item>
          <Form.Item name="description" label="Descrição">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="unit" label="Unidade base" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'un', label: 'Unidade (un)' },
                  { value: 'kg', label: 'Quilograma (kg)' },
                  { value: 'cx', label: 'Caixa (cx)' },
                  { value: 'pç', label: 'Peça (pç)' },
                  { value: 'lt', label: 'Litro (lt)' },
                  { value: 'mt', label: 'Metro (mt)' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="minStock" label="Estoque mínimo">
                <InputNumber style={{ width: '100%' }} min={0} step={1} />
              </Form.Item>
            </Col>
          </Row>
          <Divider style={{ margin: '10px 0' }}>Embalagem (fardo / caixa / pacote)</Divider>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="packageUnit" label="Tipo de embalagem">
                <Select allowClear placeholder="Opcional..." options={[
                  { value: 'fardo', label: 'Fardo' },
                  { value: 'caixa', label: 'Caixa' },
                  { value: 'pacote', label: 'Pacote' },
                  { value: 'saco', label: 'Saco' },
                  { value: 'duzia', label: 'Dúzia' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="packageQty" label="Unidades por embalagem">
                <InputNumber style={{ width: '100%' }} min={1} step={1} placeholder="Ex: 12, 24..." />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ fontSize: 12, color: 'var(--slate-400)', background: 'var(--slate-50)', padding: '8px 12px', borderRadius: 6, marginBottom: 4 }}>
            💡 Os preços de custo e venda são definidos automaticamente na entrada do produto.
          </div>
          <Form.Item name="expiryDate" label="Data de validade (opcional)">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* ── Modal de movimentação ─────────────────────────────── */}
      <Modal
        open={movementModal.open}
        onCancel={closeMovement}
        footer={null}
        title={
          movementModal.type === 'ENTRADA' ? '+ Registrar entrada' :
          movementModal.type === 'SAIDA' ? '− Registrar saída' :
          movementModal.type === 'AVARIA' ? '⚠ Registrar avaria' : '↺ Registrar troca'
        }
        width={isMobile ? '96%' : 560}
        centered
        destroyOnClose
      >
        <Form layout="vertical" form={movementForm} onFinish={saveMovement}>
          <Form.Item name="type" hidden><Input /></Form.Item>

          <Form.Item name="productId" label="Produto" rules={[{ required: true, message: 'Selecione o produto.' }]}>
            <Select
              showSearch
              placeholder="Selecionar produto..."
              optionFilterProp="label"
              options={products.map(p => ({
                value: p.id,
                label: `${p.name} (estoque: ${p.currentStock} ${p.unit})`
              }))}
              onChange={(id) => {
                const p = products.find(x => x.id === id);
                if (p) {
                  movementForm.setFieldsValue({
                    unitCost: p.costPrice,
                    salePrice: p.salePrice
                  });
                }
              }}
            />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="quantity" label="Quantidade" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} step={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unitCost" label="Custo unitário (R$)">
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
              </Form.Item>
            </Col>
          </Row>

          {movementModal.type === 'ENTRADA' && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="salePrice" label="Preço de venda (R$)">
                  <InputNumber style={{ width: '100%' }} min={0} step={0.01} placeholder="Define o preço de venda" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <div style={{ paddingTop: 28, fontSize: 12, color: 'var(--slate-500)' }}>
                  💡 Ao salvar, atualiza custo e venda do produto e recalcula cestas vinculadas.
                </div>
              </Col>
            </Row>
          )}

          {movementModal.type === 'SAIDA' && (
            <>
              <Form.Item name="salePrice" label="Preço de venda unitário (R$)">
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
              </Form.Item>
              <Form.Item name="destination" label="Destino (cliente, contrato, loja...)">
                <Input placeholder="Ex: João Silva, Contrato #123..." />
              </Form.Item>
              <Form.Item name="customerId" label="Vincular a cliente (opcional)">
                <Select
                  showSearch
                  allowClear
                  placeholder="Buscar cliente..."
                  optionFilterProp="label"
                  options={customers.map(c => ({ value: c.id, label: `${c.name} — ${c.cpf}` }))}
                />
              </Form.Item>
            </>
          )}

          {(movementModal.type === 'AVARIA' || movementModal.type === 'TROCA') && (
            <Form.Item name="reason" label="Motivo" rules={[{ required: true, message: 'Informe o motivo.' }]}>
              <Input.TextArea rows={2} placeholder="Descreva o motivo da avaria ou troca..." />
            </Form.Item>
          )}

          <Form.Item name="notes" label="Observações">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>
            Confirmar
          </Button>
        </Form>
      </Modal>


      {/* ── Drawer de cesta ─────────────────────────────────── */}
      <Drawer
        open={basketDrawer.open}
        onClose={closeBasket}
        title={basketDrawer.item ? 'Editar cesta' : 'Nova cesta básica'}
        width={isMobile ? '100%' : 580}
        footer={
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={closeBasket}>Cancelar</Button>
            <Button type="primary" onClick={() => basketForm.submit()}>Salvar</Button>
          </Space>
        }
      >
        <Form layout="vertical" form={basketForm} onFinish={saveBasket}>
          <Form.Item name="name" label="Nome da cesta" rules={[{ required: true }]}>
            <Input placeholder="Ex: Cesta Básica, Cesta Premium..." />
          </Form.Item>
          <Form.Item name="description" label="Descrição">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="salePrice" label="Preço de venda (R$)" rules={[{ required: true }]}>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={0.01}
              onChange={() => {
                // Recalcular margem visualmente
                const sale = basketForm.getFieldValue('salePrice') || 0;
                const cost = basketItems.reduce((s, item) => {
                  const prod = products.find(p => p.id === item.productId);
                  return s + (prod ? prod.costPrice * (item.quantity || 0) : 0);
                }, 0);
                if (sale > 0) {
                  const margin = (((sale - cost) / sale) * 100).toFixed(1);
                  // só info visual
                }
              }}
            />
          </Form.Item>

          <Divider>Composição da cesta</Divider>

          {/* Custo calculado */}
          {(() => {
            const cost = basketItems.reduce((s, item) => {
              const prod = products.find(p => p.id === item.productId);
              return s + (prod ? prod.costPrice * (item.quantity || 0) : 0);
            }, 0);
            const sale = basketForm.getFieldValue('salePrice') || 0;
            const margin = sale > 0 ? (((sale - cost) / sale) * 100).toFixed(1) : 0;
            return cost > 0 ? (
              <div style={{ background: 'var(--slate-50)', border: '1px solid var(--slate-200)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 11, color: 'var(--slate-400)' }}>CUSTO TOTAL</div><div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{money(cost)}</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--slate-400)' }}>MARGEM</div><div style={{ fontWeight: 700, color: margin >= 30 ? 'var(--green-500)' : margin >= 10 ? 'var(--amber-500)' : 'var(--red-500)' }}>{margin}%</div></div>
              </div>
            ) : null;
          })()}

          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {basketItems.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select
                  style={{ flex: 1 }}
                  placeholder="Selecionar produto..."
                  showSearch
                  optionFilterProp="label"
                  value={item.productId}
                  options={products.map(p => ({ value: p.id, label: `${p.name} (${p.currentStock} ${p.unit} disponíveis)` }))}
                  onChange={val => {
                    const updated = [...basketItems];
                    updated[idx] = { ...updated[idx], productId: val };
                    setBasketItems(updated);
                  }}
                />
                <InputNumber
                  style={{ width: 90 }}
                  min={0.01}
                  step={1}
                  placeholder="Qtd"
                  value={item.quantity}
                  onChange={val => {
                    const updated = [...basketItems];
                    updated[idx] = { ...updated[idx], quantity: val };
                    setBasketItems(updated);
                  }}
                />
                <Button
                  danger
                  size="small"
                  icon={<span style={{ fontSize: 10 }}>✕</span>}
                  onClick={() => setBasketItems(basketItems.filter((_, i) => i !== idx))}
                  disabled={basketItems.length === 1}
                />
              </div>
            ))}
          </Space>
          <Button
            type="dashed"
            block
            style={{ marginTop: 10 }}
            onClick={() => setBasketItems([...basketItems, { productId: undefined, quantity: 1 }])}
          >
            + Adicionar produto
          </Button>
        </Form>
      </Drawer>

      {/* ── Modal de movimentação de cesta ───────────────────── */}
      <Modal
        open={basketMovementModal.open}
        onCancel={closeBasketMovement}
        footer={null}
        title={
          basketMovementModal.type === 'MONTAGEM' ? '🔨 Montar cestas' :
          basketMovementModal.type === 'VENDA' ? '💰 Registrar venda' :
          basketMovementModal.type === 'AVARIA' ? '⚠ Registrar avaria' : '↩ Desmontar cestas'
        }
        width={isMobile ? '96%' : 500}
        centered
        destroyOnClose
      >
        <Form layout="vertical" form={basketMovementForm} onFinish={saveBasketMovement}>
          <Form.Item name="type" hidden><Input /></Form.Item>

          <Form.Item name="basketId" label="Cesta" rules={[{ required: true, message: 'Selecione a cesta.' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Selecionar cesta..."
              options={baskets.map(b => ({
                value: b.id,
                label: `${b.name} (${b.currentStock} em estoque)`
              }))}
            />
          </Form.Item>

          <Form.Item name="quantity" label="Quantidade" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={1} step={1} />
          </Form.Item>

          {basketMovementModal.type === 'VENDA' && (
            <>
              <Form.Item name="salePrice" label="Preço de venda unitário (R$)">
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
              </Form.Item>
              <Form.Item name="destination" label="Destino / cliente">
                <Input placeholder="Nome do cliente ou destino..." />
              </Form.Item>
              <Form.Item name="customerId" label="Vincular a cliente cadastrado (opcional)">
                <Select showSearch allowClear optionFilterProp="label" placeholder="Buscar cliente..."
                  options={customers.map(c => ({ value: c.id, label: `${c.name} — ${c.cpf}` }))} />
              </Form.Item>
            </>
          )}

          {(basketMovementModal.type === 'AVARIA' || basketMovementModal.type === 'DESMONTAGEM') && (
            <Form.Item name="reason" label="Motivo" rules={[{ required: true, message: 'Informe o motivo.' }]}>
              <Input.TextArea rows={2} placeholder="Descreva o motivo..." />
            </Form.Item>
          )}

          <Form.Item name="notes" label="Observações">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>Confirmar</Button>
        </Form>
      </Modal>


      {/* ── Modal de Ajuste (Estoque e Cestas) ───────────────── */}
      <Modal
        open={adjustModal.open}
        onCancel={closeAdjust}
        footer={null}
        title={adjustModal.target === 'stock' ? '⚖ Ajuste de estoque' : '⚖ Ajuste de cestas'}
        width={isMobile ? '96%' : 460}
        centered
        destroyOnClose
      >
        <Form layout="vertical" form={adjustForm} onFinish={saveAdjust}>
          <Form.Item name="type" label="Tipo de ajuste" rules={[{ required: true }]}>
            <Select options={[
              { value: 'AJUSTE_POSITIVO', label: '➕ Ajuste positivo (adicionar)' },
              { value: 'AJUSTE_NEGATIVO', label: '➖ Ajuste negativo (remover)' },
            ]} />
          </Form.Item>

          {adjustModal.target === 'stock' ? (
            <Form.Item name="productId" label="Produto" rules={[{ required: true, message: 'Selecione o produto.' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Selecionar produto..."
                options={products.map(p => ({ value: p.id, label: `${p.name} (estoque: ${p.currentStock} ${p.unit})` }))}
              />
            </Form.Item>
          ) : (
            <Form.Item name="basketId" label="Cesta" rules={[{ required: true, message: 'Selecione a cesta.' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Selecionar cesta..."
                options={baskets.map(b => ({ value: b.id, label: `${b.name} (estoque: ${b.currentStock})` }))}
              />
            </Form.Item>
          )}

          <Form.Item name="quantity" label="Quantidade" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={1} />
          </Form.Item>

          <Form.Item name="reason" label="Motivo do ajuste" rules={[{ required: true, message: 'Motivo obrigatório.' }]}>
            <Input.TextArea rows={2} placeholder="Ex: Inventário, correção de lançamento, recontagem..." />
          </Form.Item>

          <Form.Item name="notes" label="Observações">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>Confirmar ajuste</Button>
        </Form>
      </Modal>

      {/* ── Modal de Edição de Movimentação ──────────────────── */}
      <Modal
        open={editMovementModal.open}
        onCancel={closeEditMovement}
        footer={null}
        title="Editar movimentação"
        width={isMobile ? '96%' : 480}
        centered
        destroyOnClose
      >
        {editMovementModal.item && (
          <div style={{ background: 'var(--slate-50)', border: '1px solid var(--slate-200)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              <strong>{editMovementModal.item.type}</strong>
              {editMovementModal.target === 'stock'
                ? ` · ${editMovementModal.item.product?.name || '—'}`
                : ` · ${editMovementModal.item.basket?.name || '—'}`}
              {' · '}{dateBR(editMovementModal.item.createdAt)}
            </div>
          </div>
        )}
        <Form layout="vertical" form={editMovementForm} onFinish={saveEditMovement}>
          <Form.Item name="quantity" label="Quantidade" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={1} />
          </Form.Item>

          {editMovementModal.target === 'stock' && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="unitCost" label="Custo unitário (R$)">
                  <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="salePrice" label="Preço de venda (R$)">
                  <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                </Form.Item>
              </Col>
            </Row>
          )}

          {editMovementModal.target === 'basket' && (
            <Form.Item name="salePrice" label="Preço de venda (R$)">
              <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
            </Form.Item>
          )}

          <Form.Item name="destination" label="Destino">
            <Input />
          </Form.Item>

          <Form.Item name="reason" label="Motivo">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item name="notes" label="Observações">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>Salvar alterações</Button>
        </Form>
      </Modal>


      {/* ── Modal de Histórico com Estorno e Exclusão ────────── */}
      <Modal
        open={historyModal.open}
        onCancel={() => setHistoryModal({ open: false, target: 'stock' })}
        footer={null}
        title={historyModal.target === 'stock' ? '📋 Histórico de movimentações — Estoque' : '📋 Histórico de movimentações — Cestas'}
        width={isMobile ? '96%' : 900}
        centered
        destroyOnClose
      >
        <HistoryTable
          target={historyModal.target}
          products={products}
          baskets={baskets}
          customers={customers}
          api={api}
          money={money}
          dateBR={dateBR}
          ant={ant}
          onRefresh={async (target) => {
            if (target === 'stock') {
              const res = await api.get('/products');
              setProducts(res.data || []);
              loadStockSummary();
            } else {
              const res = await api.get('/baskets');
              setBaskets(res.data || []);
              loadBasketSummary();
            }
          }}
        />
      </Modal>


      {/* ── Drawer incluir/editar SPC ────────────────────────── */}
      <Drawer
        open={spcDrawer.open}
        onClose={() => { setSpcDrawer({ open: false, item: null }); spcForm.resetFields(); }}
        title={spcDrawer.item ? 'Editar registro SPC' : 'Incluir cliente no SPC'}
        width={isMobile ? '100%' : 500}
        footer={
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => { setSpcDrawer({ open: false, item: null }); spcForm.resetFields(); }}>Cancelar</Button>
            <Button type="primary" danger onClick={() => spcForm.submit()}>Salvar</Button>
          </Space>
        }
      >
        <Form layout="vertical" form={spcForm} onFinish={saveSpc}>
          {!spcDrawer.item && (
            <>
              <Form.Item name="customerId" label="Cliente (somente atrasados)" rules={[{ required: true, message: 'Selecione o cliente.' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Buscar cliente com contrato atrasado..."
                  onChange={() => spcForm.setFieldValue('contractId', null)}
                  options={customers
                    .filter(cust => contracts.some(c => c.customerId === cust.id && c.overdueInstallments > 0))
                    .map(c => ({ value: c.id, label: `${c.name} — ${c.cpf}` }))}
                />
              </Form.Item>
              <Form.Item name="contractId" label="Contrato atrasado vinculado">
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder="Selecionar contrato atrasado..."
                  disabled={!spcWatchedCustomerId}
                  options={contracts
                    .filter(c => c.overdueInstallments > 0 && (!spcWatchedCustomerId || c.customerId === spcWatchedCustomerId))
                    .map(c => ({
                      value: c.id,
                      label: `${c.product} — ${c.overdueInstallments} parcela(s) atrasada(s) — saldo ${money(c.pendingAmount || 0)}`
                    }))}
                />
              </Form.Item>
              <Form.Item name="includeDate" label="Data de inclusão">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </>
          )}
          <Form.Item name="debtAmount" label="Valor da dívida (R$)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} />
          </Form.Item>
          <Form.Item name="reason" label="Motivo da inclusão">
            <Input placeholder="Ex: Parcelas em atraso desde 01/2025..." />
          </Form.Item>
          <Form.Item name="notes" label="Observações">
            <Input.TextArea rows={3} />
          </Form.Item>
          {!spcDrawer.item && (
            <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#dc2626' }}>
              ⚠ O registro no SPC tem validade de <strong>5 anos</strong> a partir da data de inclusão.
            </div>
          )}
        </Form>
      </Drawer>

      {/* ── Modal baixar SPC ──────────────────────────────────── */}
      <Modal
        open={spcBaixarModal.open}
        onCancel={() => { setSpcBaixarModal({ open: false, item: null }); spcBaixarForm.resetFields(); }}
        footer={null}
        title="✅ Baixar registro do SPC"
        centered
        width={isMobile ? '96%' : 460}
        destroyOnClose
      >
        {spcBaixarModal.item && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12 }}>
            Cliente: <strong>{spcBaixarModal.item.customer?.name}</strong> — Dívida: <strong style={{ color: '#dc2626' }}>{money(spcBaixarModal.item.debtAmount)}</strong>
          </div>
        )}
        <Form layout="vertical" form={spcBaixarForm} onFinish={saveBaixar}>
          <Form.Item name="removedReason" label="Motivo da baixa" rules={[{ required: true, message: 'Informe o motivo.' }]}>
            <Select options={[
              { value: 'Pagamento integral', label: 'Pagamento integral' },
              { value: 'Acordo quitado', label: 'Acordo quitado' },
              { value: 'Decisao judicial', label: 'Decisão judicial' },
              { value: 'Erro de inclusao', label: 'Erro de inclusão' },
              { value: 'Prescricao', label: 'Prescrição (5 anos)' },
              { value: 'Outro', label: 'Outro' },
            ]} placeholder="Selecione o motivo..." />
          </Form.Item>
          <Form.Item name="notes" label="Observações">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block style={{ background: 'var(--green-500)', borderColor: 'var(--green-500)' }}>
            Confirmar baixa
          </Button>
        </Form>
      </Modal>

      {/* ── Modal acordo SPC ─────────────────────────────────── */}
      <Modal
        open={spcAcordoModal.open}
        onCancel={() => { setSpcAcordoModal({ open: false, item: null }); spcAcordoForm.resetFields(); }}
        footer={null}
        title="🤝 Registrar acordo"
        centered
        width={isMobile ? '96%' : 460}
        destroyOnClose
      >
        {spcAcordoModal.item && (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12 }}>
            Cliente: <strong>{spcAcordoModal.item.customer?.name}</strong> — Dívida original: <strong>{money(spcAcordoModal.item.debtAmount)}</strong>
          </div>
        )}
        <Form layout="vertical" form={spcAcordoForm} onFinish={saveAcordo}>
          <Form.Item name="agreedAmount" label="Valor acordado (R$)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} />
          </Form.Item>
          <Form.Item name="installments" label="Número de parcelas" initialValue={1}>
            <InputNumber style={{ width: '100%' }} min={1} step={1} />
          </Form.Item>
          <Form.Item name="dueDate" label="Data de vencimento" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="notes" label="Observações">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block style={{ background: 'var(--amber-500)', borderColor: 'var(--amber-500)' }}>
            Registrar acordo
          </Button>
        </Form>
      </Modal>

    </>
  );
}
