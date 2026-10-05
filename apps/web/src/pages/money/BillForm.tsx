import type { Category, MemberSummary, MeResponse } from '@stylus/shared'
import {
  Alert,
  Button,
  NativeSelect,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useRef, useState, type FormEvent } from 'react'
import type { BillFormValues, SendResult } from './billFormValues'

const HOUSEHOLD = 'household'

// 請求の入力（MONEY-F-001）と直す（MONEY-F-002）で共用するフォーム

export function BillForm({
  initial,
  me,
  members,
  categories,
  partiesEditable,
  submitLabel,
  send,
}: {
  initial: BillFormValues
  me: MeResponse
  members: MemberSummary[]
  categories: Category[]
  // 請求する側・請求先を選べるか（登録のときだけ。直すときは変えられない）
  partiesEditable: boolean
  submitLabel: string
  // 入力の検証と送信。検証に通らなければ項目ごとの知らせを返す
  send: (values: BillFormValues) => Promise<SendResult>
}) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  // 再描画の前に続けて押されても、送るのは1回だけ（MONEY-F-001/AC-14）
  const sending = useRef(false)

  const set = (key: keyof BillFormValues) => (value: string) =>
    setValues((v) => ({ ...v, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setSubmitting(true)
    setNotice(undefined)
    try {
      const result = await send(values)
      if (result.kind === 'fieldErrors') setErrors(result.errors)
      else setErrors({})
      if (result.kind === 'notice') setNotice(result.message)
    } finally {
      sending.current = false
      setSubmitting(false)
    }
  }

  const recipients = recipientOptions(me, members, values.as)

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Stack>
        {notice && <Alert color="red">{notice}</Alert>}
        {partiesEditable && me.isParent && (
          <Stack gap={4}>
            <Text size="sm" fw={500} id="bill-as-label">
              名義
            </Text>
            <SegmentedControl
              aria-labelledby="bill-as-label"
              value={values.as}
              onChange={(as) =>
                setValues((v) => {
                  const next = { ...v, as: as as BillFormValues['as'] }
                  // 選んでいた請求先が新しい名義で選べなければ外す
                  const allowed = recipientOptions(me, members, next.as).map((o) => o.value)
                  return allowed.includes(next.to) ? next : { ...next, to: '' }
                })
              }
              data={[
                { value: 'self', label: '自分' },
                { value: 'household', label: '家庭' },
              ]}
            />
          </Stack>
        )}
        {partiesEditable && (
          <NativeSelect
            label="請求先"
            value={values.to}
            onChange={(e) => set('to')(e.currentTarget.value)}
            data={[{ value: '', label: '選んでください' }, ...recipients]}
            error={errors.to}
          />
        )}
        <TextInput
          label="金額"
          inputMode="numeric"
          rightSection="円"
          value={values.amount}
          onChange={(e) => set('amount')(e.currentTarget.value)}
          error={errors.amount}
        />
        <NativeSelect
          label="カテゴリー"
          value={values.categoryId}
          onChange={(e) => set('categoryId')(e.currentTarget.value)}
          data={[
            { value: '', label: '選んでください' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
          error={errors.categoryId}
        />
        <TextInput
          label="件名"
          value={values.title}
          onChange={(e) => set('title')(e.currentTarget.value)}
          error={errors.title}
        />
        <TextInput
          label="発生日"
          type="date"
          value={values.occurredOn}
          onChange={(e) => set('occurredOn')(e.currentTarget.value)}
          error={errors.occurredOn}
        />
        <Textarea
          label="メモ"
          rows={3}
          value={values.memo}
          onChange={(e) => set('memo')(e.currentTarget.value)}
          error={errors.memo}
        />
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </Stack>
    </form>
  )
}

// 請求先の選択肢：「家庭」の名義なら息子だけ。自分の名義なら自分以外の家族と、息子なら「家庭」
function recipientOptions(me: MeResponse, members: MemberSummary[], as: BillFormValues['as']) {
  if (as === 'household') {
    return members.filter((m) => !m.isParent).map((m) => ({ value: m.id, label: m.displayName }))
  }
  const others = members
    .filter((m) => m.id !== me.id)
    .map((m) => ({ value: m.id, label: m.displayName }))
  return me.isParent ? others : [...others, { value: HOUSEHOLD, label: '家庭' }]
}
