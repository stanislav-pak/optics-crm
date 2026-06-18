import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { WORKSHOP_BRANCH_ID } from '../constants';

interface HelpModalProps {
  role: 'admin' | 'branch_admin' | 'manager';
  branchId: string;
  initialSection?: string;
  onClose: () => void;
}

type HelpBlock = {
  heading?: string;
  items: string[];
};

type HelpSection = {
  id: string;
  title: string;
  blocks: HelpBlock[];
};

const CHATS_SECTION: HelpSection = {
  id: 'chats',
  title: 'Чаты',
  blocks: [
    {
      items: [
        'Список всех WhatsApp-диалогов с клиентами открывается при запуске',
        'Нажми на чат чтобы открыть переписку',
        'Смахни вправо чтобы вернуться к списку чатов',
        '«Чат компании» в верху списка — внутренний чат с коллегами',
      ],
    },
  ],
};

const TASKS_SECTION_MANAGER: HelpSection = {
  id: 'tasks',
  title: 'Задачи',
  blocks: [
    {
      items: [
        'Красный значок на вкладке = есть задание от руководства',
        'Нажми «Принять» чтобы взять задачу в работу',
        'Нажми «Выполнено» когда задача готова — руководитель получит уведомление',
      ],
    },
  ],
};

const CRM_SECTION: HelpSection = {
  id: 'crm',
  title: 'CRM',
  blocks: [
    {
      items: [
        'База клиентов вашего филиала',
        'Поиск по имени или номеру телефона',
        'Нажми на клиента для просмотра карточки и истории покупок',
        'Из карточки клиента можно перейти в его WhatsApp-диалог',
      ],
    },
  ],
};

const INVENTORY_SECTION_MANAGER: HelpSection = {
  id: 'inventory',
  title: 'Склад',
  blocks: [
    {
      heading: 'Вкладки',
      items: [
        'Обзор — статистика остатков и алерты о заканчивающихся товарах',
        'Товары — поиск по названию, сканирование штрихкода через камеру',
        'Движения — история операций с фильтрами по типу и дате',
        'Приходы — накладные от поставщиков, кнопка «+ Приход»',
        'Списания — фиксировать испорченный или утерянный товар',
        'Возвраты — возврат товара клиенту, автоматически обновляет остаток',
        'Ревизии — пересчёт физических остатков (можно продолжить начатую)',
        'Этикетки — ценники ожидающие печати (красная точка = есть новые)',
      ],
    },
    {
      heading: 'Входящие перемещения',
      items: [
        'Красная точка на кнопке «Склад» = пришёл товар из другого филиала',
        'Открой вкладку «Движения» → нажми «Входящие» чтобы принять товар',
      ],
    },
  ],
};

function managerSections(isWorkshop: boolean): HelpSection[] {
  const common = [CHATS_SECTION, TASKS_SECTION_MANAGER, CRM_SECTION];

  if (isWorkshop) {
    return [
      ...common,
      {
        id: 'workshop',
        title: 'Мастерская',
        blocks: [
          {
            heading: 'Создание заказа',
            items: [
              'Нажми «+» → введи имя клиента, телефон, вид услуги, стоимость и предоплату → «Сохранить»',
              'Новый заказ появится в списке со статусом «Новый»',
            ],
          },
          {
            heading: 'Работа со статусами',
            items: [
              'Нажми на карточку заказа чтобы открыть детали и изменить статус',
              'Цепочка статусов: Новый → В работе → Готов → Выдан',
              'Красная точка на вкладке = есть непрочитанные новые заказы',
            ],
          },
          {
            heading: 'Журнал',
            items: [
              'Вкладка «Журнал» — история завершённых и отменённых заказов',
              'Используй фильтры по дате и филиалу для поиска нужного заказа',
            ],
          },
        ],
      },
      {
        id: 'inventory',
        title: 'Склад',
        blocks: [
          {
            items: [
              'Обзор — статистика остатков и алерты о заканчивающихся товарах',
              'Товары — поиск по названию, сканирование штрихкода через камеру',
              'Движения — история всех приходов и расходов товаров',
              'Приходы — накладные от поставщиков',
              'Ревизии — пересчёт физических остатков',
              'Этикетки — ценники ожидающие печати (красная точка = есть новые)',
            ],
          },
        ],
      },
    ];
  }

  return [
    ...common,
    {
      id: 'shop',
      title: 'Магазин',
      blocks: [
        {
          heading: 'Продажи',
          items: [
            'Нажми «+ Продажа» → добавь товары поиском или сканером штрихкода',
            'Выбери способ оплаты: Наличные / Kaspi QR / Смешанный',
            'Kaspi QR: появится QR-код → клиент сканирует → нажми «Подтвердить»',
            'Смешанный: введи сумму наличными, остаток уйдёт на Kaspi QR',
          ],
        },
        {
          heading: 'Предзаказы',
          items: [
            'Резервирование товара под конкретного клиента',
            'Нажми «+ Предзаказ» → заполни товар и данные клиента',
            'После поступления товара предзаказ можно закрыть как продажу',
          ],
        },
        {
          heading: 'Мастерская',
          items: [
            'Заказы от вашего филиала, переданные в мастерскую',
            'Статус «Готов» (зелёный) = можно выдавать клиенту',
            'Нажми на заказ → «Подтвердить получение» при выдаче клиенту',
          ],
        },
        {
          heading: 'Доплаты',
          items: [
            'Заказы где клиент ещё должен доплатить остаток',
            'Нажми «Принять оплату» → выбери способ → подтверди',
            'Число в скобках = количество заказов ожидающих доплаты',
          ],
        },
        {
          heading: 'Расходы',
          items: [
            'Фиксируй расходы филиала: аренда, хоз. нужды, канцелярия',
            'Нажми «+ Расход» → категория → сумма → описание → «Сохранить»',
          ],
        },
      ],
    },
    INVENTORY_SECTION_MANAGER,
  ];
}

function adminSections(role: 'admin' | 'branch_admin', isWorkshop: boolean): HelpSection[] {
  const sections: HelpSection[] = [
    {
      id: 'dashboard',
      title: 'Чаты',
      blocks: [
        {
          items: [
            'Список всех WhatsApp-диалогов с клиентами',
            'Нажми на чат чтобы открыть переписку',
            'CRM-панель справа (на десктопе) — карточка клиента и история покупок',
            '«Чат компании» — внутренний чат с сотрудниками команды',
          ],
        },
      ],
    },
    {
      id: 'tasks',
      title: 'Задачи',
      blocks: [
        {
          items: [
            'Нажми «+ Задача» → выбери сотрудника → заголовок → срок → «Отправить»',
            'Сотрудник получит push-уведомление о новом задании',
            'Статусы задачи: Ожидает подтверждения → Принята → Выполнена',
            'Фильтруй список по сотруднику и статусу для быстрого поиска',
          ],
        },
      ],
    },
    {
      id: 'analytics',
      title: 'Аналитика',
      blocks: [
        {
          items: [
            'Отчёты по продажам и выручке за выбранный период',
            'Выбери диапазон дат и нужный филиал для детализации',
            'Данные обновляются в реальном времени',
          ],
        },
      ],
    },
    {
      id: 'team',
      title: 'Команда',
      blocks: [
        {
          items: [
            'Активность каждого сотрудника: входы в систему и последние действия',
            'Помогает отслеживать работу команды в течение дня',
          ],
        },
      ],
    },
    {
      id: 'inventory',
      title: 'Склад',
      blocks: [
        {
          heading: 'Вкладки',
          items: [
            'Обзор — сводная статистика по всем товарам',
            'Товары — полный список, добавление новых через кнопку «+ Товар»',
            'Движения — все операции с товарами, расширенные фильтры',
            'Приходы — накладные от поставщиков',
            ...(role === 'admin'
              ? ['Продажи — полная история продаж с фильтром по филиалу и сотруднику']
              : []),
            'Списания, Возвраты, Ревизии, Этикетки',
          ],
        },
        {
          heading: 'Переключение филиала',
          items: [
            'Кнопка с названием текущего филиала — выпадающий список всех точек',
            'Выбери нужный филиал чтобы просматривать его остатки и движения',
          ],
        },
      ],
    },
    {
      id: 'expenses',
      title: 'Расходы',
      blocks: [
        {
          items: [
            'Расходы по филиалам: аренда, хоз. нужды и прочие траты',
            'Нажми «+ Расход» → категория → сумма → описание → «Сохранить»',
            'Удаление расхода — кнопка корзины (требует подтверждения)',
          ],
        },
      ],
    },
    {
      id: 'cash',
      title: 'Касса',
      blocks: [
        {
          items: [
            'Кассовые смены по всем филиалам в реальном времени',
            'Показывает текущий остаток наличных в каждой точке',
            'Открытие и закрытие смены, ввод фактического остатка при закрытии',
          ],
        },
      ],
    },
  ];

  if (isWorkshop) {
    sections.push({
      id: 'workshop',
      title: 'Мастерская',
      blocks: [
        {
          items: [
            'Все заказы мастерской (при роли admin — по всем филиалам)',
            'Нажми «+» для создания нового заказа',
            'Смена статуса через карточку: Новый → В работе → Готов → Выдан',
            'Журнал — история выданных заказов с фильтрами по дате',
            'Шестерёнка — управление каталогом услуг (добавить, изменить, удалить)',
          ],
        },
      ],
    });
  }

  if (role === 'admin') {
    sections.push(
      {
        id: 'settings',
        title: 'Настройки',
        blocks: [
          {
            items: [
              'Автоархивация чатов — задай период неактивности',
              'Чаты старше указанного периода архивируются автоматически',
            ],
          },
        ],
      },
      {
        id: 'watchlist',
        title: 'На заметке',
        blocks: [
          {
            items: [
              'Список клиентов под особым наблюдением',
              'Добавить клиента: открой его чат → нажми «На заметке»',
              'Красный значок на кнопке показывает количество клиентов в списке',
            ],
          },
        ],
      }
    );
  }

  return sections;
}

export default function HelpModal({ role, branchId, initialSection, onClose }: HelpModalProps) {
  const isWorkshop = branchId === WORKSHOP_BRANCH_ID;
  const isAdmin = role === 'admin' || role === 'branch_admin';

  const sections = isAdmin
    ? adminSections(role as 'admin' | 'branch_admin', isWorkshop)
    : managerSections(isWorkshop);

  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    if (initialSection && sections.find(s => s.id === initialSection)) return initialSection;
    return sections[0].id;
  });

  const tabsRef = useRef<HTMLDivElement>(null);
  const activeSection = sections.find(s => s.id === activeSectionId) ?? sections[0];

  const roleName = isWorkshop && !isAdmin
    ? 'Мастер'
    : role === 'admin' ? 'Администратор'
    : role === 'branch_admin' ? 'Руководитель'
    : 'Менеджер';

  useEffect(() => {
    const el = tabsRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeSectionId]);

  return (
    <div data-modal="true" className="fixed inset-0 z-50 flex flex-col bg-[#0b141a]">
      <div className="flex items-center justify-between px-4 py-3 bg-[#202c33] border-b border-white/10 flex-shrink-0">
        <div>
          <h2 className="text-white font-semibold text-base">Справка</h2>
          <p className="text-xs text-[#8696a0]">{roleName}</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a3942] text-[#8696a0] active:scale-95 transition-transform"
        >
          <X size={16} />
        </button>
      </div>

      <div
        ref={tabsRef}
        className="flex gap-2 px-3 py-2 overflow-x-auto flex-shrink-0 bg-[#111b21] border-b border-white/5"
        style={{ scrollbarWidth: 'none' }}
      >
        {sections.map(s => (
          <button
            key={s.id}
            data-active={activeSectionId === s.id ? 'true' : 'false'}
            onClick={() => setActiveSectionId(s.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeSectionId === s.id
                ? 'bg-emerald-500 text-white'
                : 'bg-[#2a3942] text-[#8696a0] active:bg-[#3a4952]'
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {activeSection.blocks.map((block, bi) => (
          <div key={bi}>
            {block.heading && (
              <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
                {block.heading}
              </p>
            )}
            <ul className="space-y-3">
              {block.items.map((item, ii) => (
                <li key={ii} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {ii + 1}
                  </span>
                  <span className="text-[#e9edef] text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
