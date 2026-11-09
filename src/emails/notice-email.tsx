import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

// The one template every email uses: a heading, some text, optionally a few
// details, a QR code and a button. Emails differ in their words, not their shape,
// so the words live in lib/registration-emails.ts. Styles are inline because
// email apps ignore stylesheets.

export type NoticeContent = {
  heading: string;
  greeting: string;
  paragraphs: string[];
  /** Label and value pairs, such as When and Where. */
  details?: { label: string; value: string }[];
  button?: { text: string; url: string };
  footer: string;
};

const text = { color: "#27272a", fontSize: "15px", lineHeight: "22px", margin: "0 0 12px" };

export function NoticeEmail({
  content,
  qr,
}: {
  content: NoticeContent;
  /** The ticket's QR, attached to the email under this content id. */
  qr?: { contentId: string; code: string };
}) {
  const { heading, greeting, paragraphs, details, button, footer } = content;
  return (
    <Html lang="en">
      <Head />
      <Preview>{paragraphs[0] ?? heading}</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            margin: "24px auto",
            maxWidth: "520px",
            padding: "24px",
          }}
        >
          <Text style={{ ...text, color: "#71717a", fontSize: "13px", fontWeight: 600 }}>
            CSMSS Events
          </Text>
          <Heading as="h1" style={{ color: "#18181b", fontSize: "20px", margin: "0 0 16px" }}>
            {heading}
          </Heading>
          <Text style={text}>{greeting}</Text>
          {paragraphs.map((paragraph, i) => (
            <Text key={i} style={{ ...text, whiteSpace: "pre-line" }}>
              {paragraph}
            </Text>
          ))}

          {details && details.length > 0 && (
            <Section
              style={{
                backgroundColor: "#f4f4f5",
                borderRadius: "8px",
                margin: "4px 0 16px",
                padding: "12px 16px",
              }}
            >
              {details.map(({ label, value }) => (
                <Text key={label} style={{ ...text, fontSize: "14px", margin: "0 0 4px" }}>
                  <strong>{label}:</strong> {value}
                </Text>
              ))}
            </Section>
          )}

          {qr && (
            <Section style={{ margin: "4px 0 16px", textAlign: "center" }}>
              <Img
                src={`cid:${qr.contentId}`}
                alt="QR code of your ticket"
                width="220"
                height="220"
                style={{ display: "block", margin: "0 auto 8px" }}
              />
              <Text
                style={{
                  ...text,
                  fontFamily: "'Courier New', monospace",
                  fontSize: "16px",
                  fontWeight: 700,
                  letterSpacing: "1px",
                }}
              >
                {qr.code}
              </Text>
            </Section>
          )}

          {button && (
            <Section style={{ margin: "4px 0 16px" }}>
              <Button
                href={button.url}
                style={{
                  backgroundColor: "#18181b",
                  borderRadius: "8px",
                  color: "#ffffff",
                  display: "inline-block",
                  fontSize: "14px",
                  fontWeight: 600,
                  padding: "10px 16px",
                  textDecoration: "none",
                }}
              >
                {button.text}
              </Button>
            </Section>
          )}

          <Hr style={{ borderColor: "#e4e4e7", margin: "16px 0" }} />
          <Text style={{ ...text, color: "#71717a", fontSize: "13px", margin: 0 }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
