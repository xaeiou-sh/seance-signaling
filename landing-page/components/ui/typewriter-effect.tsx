import { useEffect, useState } from "react"
import { motion } from "framer-motion"

interface TypewriterEffectProps {
  words: string[]
  className?: string
  cursorClassName?: string
}

export const TypewriterEffect = ({
  words,
  className = "",
  cursorClassName = "",
}: TypewriterEffectProps) => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [currentText, setCurrentText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const currentWord = words[currentWordIndex]

    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          // Typing
          if (currentText.length < currentWord.length) {
            setCurrentText(currentWord.slice(0, currentText.length + 1))
          } else {
            // Wait before deleting
            setTimeout(() => setIsDeleting(true), 1500)
          }
        } else {
          // Deleting
          if (currentText.length === 0) {
            setIsDeleting(false)
            setCurrentWordIndex((prev) => (prev + 1) % words.length)
          } else {
            setCurrentText(currentText.slice(0, -1))
          }
        }
      },
      isDeleting ? 50 : 100
    )

    return () => clearTimeout(timeout)
  }, [currentText, isDeleting, currentWordIndex, words])

  return (
    <span className={`relative inline-block ${className}`}>
      <span>{currentText}</span>
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
        className={`absolute top-0 -right-1 inline-block h-[1em] w-[2px] bg-current ${cursorClassName}`}
      />
    </span>
  )
}
