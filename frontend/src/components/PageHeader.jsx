import { Space, Typography } from 'antd';

export default function PageHeader({ title, subtitle, extra }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 4
      }}
    >
      <Space direction="vertical" size={4} style={{ minWidth: 0 }}>
        <Typography.Title
          level={2}
          className="page-header-title"
          style={{
            margin: 0,
            fontSize: 'clamp(24px, 3vw, 32px)',
            lineHeight: 1.1,
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.02em'
          }}
        >
          {title}
        </Typography.Title>

        {subtitle ? (
          <Typography.Paragraph
            className="page-header-subtitle"
            style={{
              margin: 0,
              fontSize: 'clamp(14px, 2vw, 16px)',
              lineHeight: 1.5,
              maxWidth: 760,
              color: '#64748b'
            }}
          >
            {subtitle}
          </Typography.Paragraph>
        ) : null}
      </Space>

      {extra ? (
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            width: 'fit-content',
            maxWidth: '100%'
          }}
        >
          {extra}
        </div>
      ) : null}
    </div>
  );
}
